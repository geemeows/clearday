// Slack `conversations.list` adapter: returns channels the user is a
// member of, used to prefill the onboarding allowlist textarea so the
// user can pick from channels they're already in instead of pasting
// raw IDs. Pure module with injected fetch + token; mirrors
// `slack-reply.ts`. Worker glue loads the Slack access token from
// provider_accounts and calls this.

export type SlackFetch = typeof fetch;

export type ListSlackChannelsDeps = {
  token: string | null;
  fetch: SlackFetch;
};

export type SlackChannelSummary = {
  id: string;
  name: string;
  is_private: boolean;
};

export type ListSlackChannelsResult =
  | { ok: true; channels: SlackChannelSummary[] }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "api_error";
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

const PAGE_LIMIT = 200;
const MAX_PAGES = 10;

export async function listSlackChannels(
  deps: ListSlackChannelsDeps,
): Promise<ListSlackChannelsResult> {
  if (!deps.token) {
    return {
      ok: false,
      error: "slack not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }

  const out: SlackChannelSummary[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      exclude_archived: "true",
      limit: String(PAGE_LIMIT),
      types: "public_channel,private_channel",
    });
    if (cursor) params.set("cursor", cursor);

    let res: Awaited<ReturnType<SlackFetch>>;
    try {
      res = await deps.fetch(
        `https://slack.com/api/conversations.list?${params.toString()}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${deps.token}` },
        },
      );
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
      channels?: Array<{
        id?: string;
        name?: string;
        is_member?: boolean;
        is_private?: boolean;
      }>;
      response_metadata?: { next_cursor?: string };
    } | null;
    if (!body?.ok) {
      const error = body?.error ?? "unknown_error";
      return {
        ok: false,
        error: `slack conversations.list: ${error}`,
        reason: "api_error",
        needs_reauth: REAUTH_ERRORS.has(error),
      };
    }
    for (const ch of body.channels ?? []) {
      if (!ch.is_member) continue;
      if (typeof ch.id !== "string" || ch.id.length === 0) continue;
      out.push({
        id: ch.id,
        name: typeof ch.name === "string" ? ch.name : "",
        is_private: ch.is_private === true,
      });
    }
    cursor = body.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }

  return { ok: true, channels: out };
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
