// Calendar write actions: decline + reschedule a Google Calendar event. Pure
// module with injected fetch + token; no SDKs. Worker glue loads the Google
// access token from provider_accounts and calls these.
//
// Decline: GET the event to read its attendees list, then PATCH with the same
// list with self.responseStatus flipped to declined.
//
// Reschedule: GET the event to read its current start/end dateTime, then PATCH
// with start.dateTime + end.dateTime shifted by `shift_minutes`. timeZone is
// preserved when present; original offset is replaced with the shifted UTC
// instant rendered as ISO Z. All-day events (no dateTime) cannot be shifted
// and return a `no_time` reason.

export type DeclineEventParams = {
  event_id: string;
  calendar_id?: string;
};

export type GoogleFetch = typeof fetch;

export type DeclineEventDeps = {
  token: string | null;
  fetch: GoogleFetch;
};

export type DeclineEventResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "invalid_event" | "not_attendee" | "api_error";
      needs_reauth?: boolean;
    };

type GoogleAttendee = {
  email?: string;
  self?: boolean;
  responseStatus?: string;
};

type GoogleEvent = {
  id?: string;
  attendees?: GoogleAttendee[];
};

export async function declineCalendarEvent(
  params: DeclineEventParams,
  deps: DeclineEventDeps,
): Promise<DeclineEventResult> {
  const eventId = (params.event_id ?? "").trim();
  if (eventId.length === 0) {
    return {
      ok: false,
      error: "event_id required",
      reason: "invalid_event",
    };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "google not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const calendarId = encodeURIComponent(params.calendar_id ?? "primary");
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;

  let getRes: Awaited<ReturnType<GoogleFetch>>;
  try {
    getRes = await deps.fetch(base, {
      method: "GET",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/json",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  if (!getRes.ok) {
    const text = await safeText(getRes);
    return {
      ok: false,
      error: `google HTTP ${getRes.status}: ${text.slice(0, 200)}`,
      reason: "api_error",
      needs_reauth: getRes.status === 401 || getRes.status === 403,
    };
  }
  const event = (await safeJson(getRes)) as GoogleEvent | null;
  const attendees = event?.attendees ?? [];
  const selfIdx = attendees.findIndex((a) => a.self === true);
  if (selfIdx < 0) {
    return {
      ok: false,
      error: "you are not an attendee on this event",
      reason: "not_attendee",
    };
  }
  const next = attendees.map((a, i) =>
    i === selfIdx ? { ...a, responseStatus: "declined" } : a,
  );

  let patchRes: Awaited<ReturnType<GoogleFetch>>;
  try {
    patchRes = await deps.fetch(`${base}?sendUpdates=all`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ attendees: next }),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  if (!patchRes.ok) {
    const text = await safeText(patchRes);
    return {
      ok: false,
      error: `google HTTP ${patchRes.status}: ${text.slice(0, 200)}`,
      reason: "api_error",
      needs_reauth: patchRes.status === 401 || patchRes.status === 403,
    };
  }
  return { ok: true };
}

export type RescheduleEventParams = {
  event_id: string;
  calendar_id?: string;
  shift_minutes: number;
};

export type RescheduleEventDeps = {
  token: string | null;
  fetch: GoogleFetch;
};

export type RescheduleEventResult =
  | { ok: true; start: string; end: string }
  | {
      ok: false;
      error: string;
      reason:
        | "no_token"
        | "invalid_event"
        | "invalid_shift"
        | "no_time"
        | "api_error";
      needs_reauth?: boolean;
    };

type GoogleEventTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

type GoogleEventForReschedule = {
  start?: GoogleEventTime;
  end?: GoogleEventTime;
};

export async function rescheduleCalendarEvent(
  params: RescheduleEventParams,
  deps: RescheduleEventDeps,
): Promise<RescheduleEventResult> {
  const eventId = (params.event_id ?? "").trim();
  if (eventId.length === 0) {
    return {
      ok: false,
      error: "event_id required",
      reason: "invalid_event",
    };
  }
  if (!Number.isFinite(params.shift_minutes) || params.shift_minutes === 0) {
    return {
      ok: false,
      error: "shift_minutes must be a non-zero number",
      reason: "invalid_shift",
    };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "google not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const calendarId = encodeURIComponent(params.calendar_id ?? "primary");
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;

  let getRes: Awaited<ReturnType<GoogleFetch>>;
  try {
    getRes = await deps.fetch(base, {
      method: "GET",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/json",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  if (!getRes.ok) {
    const text = await safeText(getRes);
    return {
      ok: false,
      error: `google HTTP ${getRes.status}: ${text.slice(0, 200)}`,
      reason: "api_error",
      needs_reauth: getRes.status === 401 || getRes.status === 403,
    };
  }
  const event = (await safeJson(getRes)) as GoogleEventForReschedule | null;
  const startDt = event?.start?.dateTime;
  const endDt = event?.end?.dateTime;
  if (typeof startDt !== "string" || typeof endDt !== "string") {
    return {
      ok: false,
      error: "event has no dateTime (all-day events cannot be shifted)",
      reason: "no_time",
    };
  }
  const startMs = Date.parse(startDt);
  const endMs = Date.parse(endDt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return {
      ok: false,
      error: "event start/end is not a parseable RFC 3339 timestamp",
      reason: "no_time",
    };
  }
  const shiftMs = params.shift_minutes * 60_000;
  const nextStart = new Date(startMs + shiftMs).toISOString();
  const nextEnd = new Date(endMs + shiftMs).toISOString();
  const patchBody = {
    start: { dateTime: nextStart, ...preserveTz(event?.start) },
    end: { dateTime: nextEnd, ...preserveTz(event?.end) },
  };

  let patchRes: Awaited<ReturnType<GoogleFetch>>;
  try {
    patchRes = await deps.fetch(`${base}?sendUpdates=all`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${deps.token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(patchBody),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      reason: "api_error",
    };
  }
  if (!patchRes.ok) {
    const text = await safeText(patchRes);
    return {
      ok: false,
      error: `google HTTP ${patchRes.status}: ${text.slice(0, 200)}`,
      reason: "api_error",
      needs_reauth: patchRes.status === 401 || patchRes.status === 403,
    };
  }
  return { ok: true, start: nextStart, end: nextEnd };
}

function preserveTz(t: GoogleEventTime | undefined): { timeZone?: string } {
  return typeof t?.timeZone === "string" ? { timeZone: t.timeZone } : {};
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeJson(res: {
  json: () => Promise<unknown>;
}): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
