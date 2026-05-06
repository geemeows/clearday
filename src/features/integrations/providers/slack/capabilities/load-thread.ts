// Load a Slack thread for the inbox detail pane. Calls
// `conversations.replies` and resolves author user-ids to display names so
// the frontend can render the conversation context above the reply composer
// without a second round-trip per message.
//
// The shape mirrors `slack-reply.ts`: pure module with injected fetch +
// token, and the same `needs_reauth` flag for the SPA to prompt reconnect
// when scopes/tokens are missing.

export type LoadSlackThreadParams = {
  channel: string;
  thread_ts: string;
};

export type SlackFetch = typeof fetch;

export type LoadSlackThreadDeps = {
  token: string | null;
  fetch: SlackFetch;
};

export type SlackThreadMessage = {
  ts: string;
  user_id: string | null;
  user_name: string | null;
  text: string;
  is_self: boolean;
};

export type LoadSlackThreadResult =
  | { ok: true; messages: SlackThreadMessage[] }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "invalid_input" | "api_error";
      needs_reauth?: boolean;
    };

const REAUTH_ERRORS = new Set([
  "not_authed",
  "invalid_auth",
  "token_revoked",
  "token_expired",
  "missing_scope",
  "no_permission",
]);

const USER_MENTION_RE = /<@([UW][A-Z0-9]+)>/g;

export async function loadSlackThread(
  params: LoadSlackThreadParams,
  deps: LoadSlackThreadDeps,
  selfUserId?: string | null,
): Promise<LoadSlackThreadResult> {
  const channel = (params.channel ?? "").trim();
  const thread_ts = (params.thread_ts ?? "").trim();
  if (!channel || !thread_ts) {
    return {
      ok: false,
      error: "channel and thread_ts required",
      reason: "invalid_input",
    };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "slack not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }

  const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(
    channel,
  )}&ts=${encodeURIComponent(thread_ts)}&limit=200`;
  let res: Awaited<ReturnType<SlackFetch>>;
  try {
    res = await deps.fetch(url, {
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
  if (!res.ok) {
    return {
      ok: false,
      error: `slack HTTP ${res.status}`,
      reason: "api_error",
      needs_reauth: res.status === 401 || res.status === 403,
    };
  }
  const body = (await safeJson(res)) as {
    ok?: boolean;
    error?: string;
    messages?: Array<{
      ts?: string;
      user?: string;
      text?: string;
      bot_id?: string;
      subtype?: string;
    }>;
  } | null;
  if (!body?.ok) {
    const error = body?.error ?? "unknown_error";
    return {
      ok: false,
      error: `slack conversations.replies: ${error}`,
      reason: "api_error",
      needs_reauth: REAUTH_ERRORS.has(error),
    };
  }

  const raw = body.messages ?? [];
  const userIds = new Set<string>();
  for (const msg of raw) {
    if (msg.user) userIds.add(msg.user);
    if (typeof msg.text === "string") {
      for (const m of msg.text.matchAll(USER_MENTION_RE)) {
        if (m[1]) userIds.add(m[1]);
      }
    }
  }
  const names =
    userIds.size > 0
      ? await resolveUserNames(deps.token, deps.fetch, userIds)
      : new Map<string, string>();

  const messages: SlackThreadMessage[] = [];
  for (const msg of raw) {
    if (!msg.ts) continue;
    if (msg.bot_id) continue;
    if (msg.subtype && msg.subtype !== "thread_broadcast") continue;
    const userId = msg.user ?? null;
    const userName = userId ? (names.get(userId) ?? null) : null;
    const text = (msg.text ?? "").replace(
      USER_MENTION_RE,
      (raw, id: string) => {
        const n = names.get(id);
        return n ? `@${n}` : raw;
      },
    );
    messages.push({
      ts: msg.ts,
      user_id: userId,
      user_name: userName,
      text,
      is_self: !!selfUserId && userId === selfUserId,
    });
  }
  return { ok: true, messages };
}

async function resolveUserNames(
  token: string,
  fetchImpl: SlackFetch,
  ids: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const url = `https://slack.com/api/users.info?user=${encodeURIComponent(id)}`;
        const res = await fetchImpl(url, {
          method: "GET",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
          },
        });
        if (!res.ok) return;
        const body = (await safeJson(res)) as {
          ok?: boolean;
          user?: {
            real_name?: string;
            name?: string;
            profile?: { display_name?: string; real_name?: string };
          };
        } | null;
        if (!body?.ok || !body.user) return;
        const name =
          body.user.profile?.display_name ||
          body.user.profile?.real_name ||
          body.user.real_name ||
          body.user.name ||
          null;
        if (name) out.set(id, name);
      } catch {
        // best-effort
      }
    }),
  );
  return out;
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
