// Slack quick-reply: post a message back to the channel/thread of a
// Slack mention/DM/thread Signal via `chat.postMessage`. Pure module
// with injected fetch + token; mirrors `pr-review.ts`. Worker glue
// loads the Slack access token from provider_accounts and calls this.
//
// Slack returns HTTP 200 with `ok:false, error:"..."` for most failures
// (including auth/scope problems) — we map `not_authed`,
// `invalid_auth`, `token_revoked`, and `missing_scope` to a
// `needs_reauth` flag so the SPA can prompt the user to reauthorize.

export type PostSlackReplyParams = {
  channel: string;
  text: string;
  thread_ts?: string;
};

export type SlackFetch = typeof fetch;

export type PostSlackReplyDeps = {
  token: string | null;
  fetch: SlackFetch;
};

export type PostSlackReplyResult =
  | { ok: true; ts: string; channel: string }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "missing_text" | "invalid_channel" | "api_error";
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

export async function postSlackReply(
  params: PostSlackReplyParams,
  deps: PostSlackReplyDeps,
): Promise<PostSlackReplyResult> {
  const channel = (params.channel ?? "").trim();
  if (channel.length === 0) {
    return {
      ok: false,
      error: "channel required",
      reason: "invalid_channel",
    };
  }
  const text = (params.text ?? "").trim();
  if (text.length === 0) {
    return { ok: false, error: "text required", reason: "missing_text" };
  }
  if (!deps.token) {
    return {
      ok: false,
      error: "slack not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const payload: Record<string, unknown> = { channel, text };
  if (params.thread_ts) payload.thread_ts = params.thread_ts;

  let res: Awaited<ReturnType<SlackFetch>>;
  try {
    res = await deps.fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
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
    ts?: string;
    channel?: string;
  } | null;
  if (!body?.ok) {
    const error = body?.error ?? "unknown_error";
    return {
      ok: false,
      error: `slack chat.postMessage: ${error}`,
      reason: "api_error",
      needs_reauth: REAUTH_ERRORS.has(error),
    };
  }
  return {
    ok: true,
    ts: body.ts ?? "",
    channel: body.channel ?? channel,
  };
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
