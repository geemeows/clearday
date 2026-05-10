// Focus session: fire-and-forget side effects across Google Calendar +
// Slack. Pure module with injected fetch + tokens; no Supabase, no SDKs.
// Worker glue loads tokens and calls this; nothing about the session is
// stored locally — the providers' own expirations are the source of truth.
//
// Multi-account (#120): Slack is the one explicit fan-out — DND + status
// are set on every connected Slack account so heads-down means heads-down
// everywhere. Each per-account write is independent; one expired token on
// workspace B does not abort the session for workspace A or for Calendar.
// The result records per-account outcomes so the caller can stamp
// `provider_accounts.status` (the per-account status surface) for the
// failing rows without aborting the session.

export type FocusStartParams = {
  duration_minutes: number;
  message?: string;
};

export type SlackAccountToken = {
  /** `provider_accounts.id` for the account row this token belongs to. */
  accountId: string;
  token: string;
};

export type FocusTokens = {
  google: string | null;
  /** One entry per connected Slack account. Empty array = no Slack
   * connected; the session continues with Calendar-only side effects. */
  slack: SlackAccountToken[];
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
  | { ok: false; error: string; reason?: "no_token" | "auth_failed" | "api_error" };

export type SlackAccountOutcome = {
  accountId: string;
  status: ProviderOutcome;
  dnd: ProviderOutcome;
};

export type FocusStartResult = {
  calendar: ProviderOutcome & { eventId?: string };
  slack: SlackAccountOutcome[];
};

export type FocusEndDeps = {
  tokens: { slack: SlackAccountToken[] };
  fetch: typeof fetch;
};

export type FocusEndResult = {
  slack: SlackAccountOutcome[];
};

const DEFAULT_EMOJI = ":no_bell:";

// Slack error codes that mean "this token is dead — record the per-account
// failure so the user can reauthorize that one workspace from Settings".
const SLACK_AUTH_ERRORS = new Set([
  "invalid_auth",
  "not_authed",
  "token_revoked",
  "token_expired",
  "account_inactive",
]);

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

  const calendarP = writeCalendarEvent(summary, start, end, deps);
  const slackP = Promise.all(
    deps.tokens.slack.map(async (acct) => {
      const [status, dnd] = await Promise.all([
        writeSlackStatus(summary, end, acct.token, deps),
        writeSlackDnd(params.duration_minutes, acct.token, deps),
      ]);
      return { accountId: acct.accountId, status, dnd };
    }),
  );
  const [calendar, slack] = await Promise.all([calendarP, slackP]);
  return { calendar, slack };
}

/**
 * End an in-progress Focus session: clear DND and the status emoji/text on
 * every connected Slack account. Symmetric counterpart to
 * `startFocusSession` — partial failures are reported per-account and never
 * abort the rest of the fan-out.
 */
export async function endFocusSession(
  deps: FocusEndDeps,
): Promise<FocusEndResult> {
  const slack = await Promise.all(
    deps.tokens.slack.map(async (acct) => {
      const [status, dnd] = await Promise.all([
        clearSlackStatus(acct.token, deps.fetch),
        clearSlackDnd(acct.token, deps.fetch),
      ]);
      return { accountId: acct.accountId, status, dnd };
    }),
  );
  return { slack };
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
  token: string,
  deps: FocusDeps,
): Promise<ProviderOutcome> {
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
  token: string,
  deps: FocusDeps,
): Promise<ProviderOutcome> {
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

async function clearSlackStatus(
  token: string,
  fetchImpl: typeof fetch,
): Promise<ProviderOutcome> {
  try {
    const res = await fetchImpl("https://slack.com/api/users.profile.set", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        profile: { status_text: "", status_emoji: "", status_expiration: 0 },
      }),
    });
    return await slackOutcome(res, "users.profile.set");
  } catch (err) {
    return { ok: false, error: errMsg(err), reason: "api_error" };
  }
}

async function clearSlackDnd(
  token: string,
  fetchImpl: typeof fetch,
): Promise<ProviderOutcome> {
  try {
    const res = await fetchImpl("https://slack.com/api/dnd.endDnd", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
    });
    return await slackOutcome(res, "dnd.endDnd");
  } catch (err) {
    return { ok: false, error: errMsg(err), reason: "api_error" };
  }
}

async function slackOutcome(
  res: { ok: boolean; status: number; json: () => Promise<unknown> },
  label: string,
): Promise<ProviderOutcome> {
  if (!res.ok) {
    const reason = res.status === 401 || res.status === 403 ? "auth_failed" : "api_error";
    return {
      ok: false,
      error: `${label} HTTP ${res.status}`,
      reason,
    };
  }
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) {
    const code = body.error ?? "unknown_error";
    const reason: "auth_failed" | "api_error" = SLACK_AUTH_ERRORS.has(code)
      ? "auth_failed"
      : "api_error";
    return {
      ok: false,
      error: `${label}: ${code}`,
      reason,
    };
  }
  return { ok: true };
}

// Boundary emitters. The Focus session module is the canonical seam for
// emitting `focus_started` / `focus_ended` events into the Automations
// orchestrator. Callers (worker focus route on session start; future
// session-end watcher on the end boundary) call these instead of reaching
// into features/automations directly so the boundary semantics live in one
// place.
export type FocusBoundaryDispatch = (
  boundary: "focus_started" | "focus_ended",
  sessionId: string,
  durationMinutes: number,
) => Promise<void>;

export async function emitFocusStarted(
  sessionId: string,
  durationMinutes: number,
  dispatch: FocusBoundaryDispatch,
): Promise<void> {
  await dispatch("focus_started", sessionId, durationMinutes);
}

export async function emitFocusEnded(
  sessionId: string,
  durationMinutes: number,
  dispatch: FocusBoundaryDispatch,
): Promise<void> {
  await dispatch("focus_ended", sessionId, durationMinutes);
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
