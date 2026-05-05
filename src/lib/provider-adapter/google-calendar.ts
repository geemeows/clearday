// Google Calendar provider adapter. v1 polls the user's primary calendar for
// events in a forward window and turns each "real meeting" into a Signal of
// `kind: "meeting"`. Real means: response status accepted/tentative, not an
// all-day event, and the agenda exposes a video link we can deep-link to.
//
// Pure: parametric on a fetch function so the cron orchestrator on the
// Worker and the fixture-driven tests under jsdom share one implementation.

import type { Signal } from "#/lib/signal";

const PRIMARY_EVENTS =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const FORWARD_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CalendarFetch = (
  input: string,
  init: { headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  status?: string;
  hangoutLink?: string;
  htmlLink?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{
    self?: boolean;
    email?: string;
    responseStatus?: string;
  }>;
  organizer?: { email?: string; self?: boolean };
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  // Native Google "Focus time" events (created via the Calendar UI) come back
  // with eventType === "focusTime"; events created by clearday's
  // focus-session module carry extendedProperties.private.clearday_focus.
  eventType?: string;
  extendedProperties?: {
    private?: Record<string, string | undefined>;
    shared?: Record<string, string | undefined>;
  };
};

export type GoogleCalendarResponse = {
  items?: GoogleCalendarEvent[];
};

export class CalendarPollError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`google calendar poll failed (${status}): ${body.slice(0, 200)}`);
    this.name = "CalendarPollError";
  }
}

export async function pollCalendarSignals(
  accessToken: string,
  fetchImpl: CalendarFetch,
  now: Date = new Date(),
): Promise<Signal[]> {
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + FORWARD_WINDOW_MS).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const res = await fetchImpl(`${PRIMARY_EVENTS}?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new CalendarPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as GoogleCalendarResponse;
  const events = body.items ?? [];
  const out: Signal[] = [];
  for (const event of events) {
    const sig = normalize(event);
    if (sig) out.push(sig);
  }
  return out;
}

export function normalize(event: GoogleCalendarEvent): Signal | null {
  // All-day events use the `date` field instead of `dateTime`. We never want
  // them in the inbox/today surface — they're not "meetings" in the sense the
  // 10-min alert path cares about.
  if (!event.start.dateTime || !event.end.dateTime) return null;

  const responseStatus = selfResponseStatus(event);
  if (responseStatus === "declined") return null;

  const isFocus = isFocusEvent(event);
  const videoLink = pickVideoLink(event);

  const linkedItems = parseLinkedItems(event.description ?? "");

  return {
    provider: "google",
    kind: "meeting",
    source_id: event.id,
    title: event.summary?.trim() || "(untitled meeting)",
    url: event.htmlLink ?? null,
    payload: {
      starts_at: event.start.dateTime,
      ends_at: event.end.dateTime,
      video_link: videoLink,
      response_status: responseStatus,
      organizer: event.organizer?.email ?? null,
      linked_items: linkedItems,
      ...(isFocus ? { is_focus: true } : {}),
    },
    requires_action: false,
    source_created_at: event.start.dateTime,
  };
}

function isFocusEvent(event: GoogleCalendarEvent): boolean {
  if (event.eventType === "focusTime") return true;
  return event.extendedProperties?.private?.clearday_focus === "1";
}

function selfResponseStatus(event: GoogleCalendarEvent): string {
  const me = (event.attendees ?? []).find((a) => a.self);
  if (me?.responseStatus) return me.responseStatus;
  // Solo events (organized by you, no other attendees) come back without an
  // attendees list at all — treat them as accepted.
  if (event.organizer?.self) return "accepted";
  return "accepted";
}

const VIDEO_HOSTS = [
  "meet.google.com",
  "zoom.us",
  "zoomgov.com",
  "teams.microsoft.com",
  "teams.live.com",
];

function pickVideoLink(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  for (const ep of event.conferenceData?.entryPoints ?? []) {
    if (ep.entryPointType === "video" && ep.uri) return ep.uri;
  }
  for (const haystack of [event.location ?? "", event.description ?? ""]) {
    const match = findVideoUrl(haystack);
    if (match) return match;
  }
  return null;
}

function findVideoUrl(text: string): string | null {
  if (!text) return null;
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  for (const raw of urls) {
    const clean = trimUrl(raw);
    try {
      const u = new URL(clean);
      if (VIDEO_HOSTS.some((h) => u.hostname.endsWith(h))) return clean;
    } catch {
      // skip
    }
  }
  return null;
}

export type LinkedItem =
  | { kind: "pr"; url: string; repo: string; number: number }
  | { kind: "ticket"; url: string; key: string };

export function parseLinkedItems(description: string): LinkedItem[] {
  const out: LinkedItem[] = [];
  const seen = new Set<string>();
  const urls = description.match(/https?:\/\/\S+/g) ?? [];
  for (const raw of urls) {
    const url = trimUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    const pr = url.match(
      /^https?:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/,
    );
    if (pr) {
      out.push({
        kind: "pr",
        url,
        repo: pr[1],
        number: Number.parseInt(pr[2], 10),
      });
      continue;
    }
    const linear = url.match(
      /^https?:\/\/linear\.app\/[^/]+\/issue\/([A-Z0-9-]+)/,
    );
    if (linear) {
      out.push({ kind: "ticket", url, key: linear[1] });
      continue;
    }
    const jira = url.match(/^https?:\/\/[^/]+\/browse\/([A-Z][A-Z0-9]+-\d+)/);
    if (jira) {
      out.push({ kind: "ticket", url, key: jira[1] });
    }
  }
  return out;
}

function trimUrl(raw: string): string {
  // Strip trailing punctuation that often follows URLs in agendas.
  return raw.replace(/[).,;!?>\]]+$/, "");
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
