// Focus session: fire-and-forget side effects across Google Calendar +
// Slack. Pure module with injected fetch + tokens; no Supabase, no SDKs.
// Worker glue loads tokens and calls this; nothing about the session is
// stored locally — the providers' own expirations are the source of truth.
//
// Best-effort semantics: each provider write is independent. A failure in
// one (e.g. Slack token revoked) must not roll back the others — Calendar
// can still hold the busy block, etc. The result records per-provider
// outcomes so the caller can surface a clear partial-success message.

export type FocusStartParams = {
  duration_minutes: number;
  message?: string;
};

export type FocusTokens = {
  google: string | null;
  slack: string | null;
};

export type FocusDeps = {
  tokens: FocusTokens;
  fetch: typeof fetch;
  now?: () => Date;
  /** Calendar id; defaults to the user's primary calendar. */
  calendarId?: string;
  /** Status emoji for Slack profile; defaults to :no_bell:. */
  statusEmoji?: string;
};

export type ProviderOutcome =
  | { ok: true }
  | { ok: false; error: string; reason?: "no_token" | "api_error" };

export type FocusStartResult = {
  calendar: ProviderOutcome & { eventId?: string };
  slack_status: ProviderOutcome;
  slack_dnd: ProviderOutcome;
};

const DEFAULT_EMOJI = ":no_bell:";

export async function startFocusSession(
  params: FocusStartParams,
  deps: FocusDeps,
): Promise<FocusStartResult> {
  if (
    !Number.isFinite(params.duration_minutes) ||
    params.duration_minutes <= 0
  ) {
    throw new Error("duration_minutes must be a positive number");
  }
  const now = (deps.now ?? (() => new Date()))();
  const start = now;
  const end = new Date(now.getTime() + params.duration_minutes * 60 * 1000);
  const summary = (params.message ?? "Focus").trim() || "Focus";

  const [calendar, slack_status, slack_dnd] = await Promise.all([
    writeCalendarEvent(summary, start, end, deps),
    writeSlackStatus(summary, end, deps),
    writeSlackDnd(params.duration_minutes, deps),
  ]);

  return { calendar, slack_status, slack_dnd };
}

async function writeCalendarEvent(
  summary: string,
  start: Date,
  end: Date,
  deps: FocusDeps,
): Promise<ProviderOutcome & { eventId?: string }> {
  const token = deps.tokens.google;
  if (!token) {
    return { ok: false, error: "google not connected", reason: "no_token" };
  }
  const calendarId = encodeURIComponent(deps.calendarId ?? "primary");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  try {
    const res = await deps.fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        summary,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        transparency: "opaque",
        visibility: "private",
        // Stamp a private extendedProperty so the google-calendar adapter can
        // mark the resulting Signal with payload.is_focus = true exactly,
        // instead of falling back to a title heuristic.
        extendedProperties: { private: { clearday_focus: "1" } },
      }),
    });
    if (!res.ok) {
      const text = await safeText(res);
      return {
        ok: false,
        error: `calendar HTTP ${res.status}: ${text.slice(0, 200)}`,
        reason: "api_error",
      };
    }
    const body = (await res.json()) as { id?: string };
    return { ok: true, eventId: body.id };
  } catch (err) {
    return { ok: false, error: errMsg(err), reason: "api_error" };
  }
}

async function writeSlackStatus(
  message: string,
  end: Date,
  deps: FocusDeps,
): Promise<ProviderOutcome> {
  const token = deps.tokens.slack;
  if (!token)
    return { ok: false, error: "slack not connected", reason: "no_token" };
  try {
    const res = await deps.fetch("https://slack.com/api/users.profile.set", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        profile: {
          status_text: message,
          status_emoji: deps.statusEmoji ?? DEFAULT_EMOJI,
          status_expiration: Math.floor(end.getTime() / 1000),
        },
      }),
    });
    return await slackOutcome(res, "users.profile.set");
  } catch (err) {
    return { ok: false, error: errMsg(err), reason: "api_error" };
  }
}

async function writeSlackDnd(
  durationMinutes: number,
  deps: FocusDeps,
): Promise<ProviderOutcome> {
  const token = deps.tokens.slack;
  if (!token)
    return { ok: false, error: "slack not connected", reason: "no_token" };
  try {
    // dnd.setSnooze takes a form-encoded `num_minutes`.
    const body = new URLSearchParams({
      num_minutes: String(Math.max(1, Math.round(durationMinutes))),
    });
    const res = await deps.fetch("https://slack.com/api/dnd.setSnooze", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    return await slackOutcome(res, "dnd.setSnooze");
  } catch (err) {
    return { ok: false, error: errMsg(err), reason: "api_error" };
  }
}

async function slackOutcome(
  res: { ok: boolean; status: number; json: () => Promise<unknown> },
  label: string,
): Promise<ProviderOutcome> {
  if (!res.ok) {
    return {
      ok: false,
      error: `${label} HTTP ${res.status}`,
      reason: "api_error",
    };
  }
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) {
    return {
      ok: false,
      error: `${label}: ${body.error ?? "unknown_error"}`,
      reason: "api_error",
    };
  }
  return { ok: true };
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
