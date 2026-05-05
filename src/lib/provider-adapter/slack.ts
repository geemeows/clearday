// Slack provider adapter. Two surfaces share the same Signal shape:
//
// 1. Webhook event normalization (`normalizeSlackEvent`) — translates a single
//    `message` / `app_mention` Events API payload into a Signal.
// 2. Cron-driven polling (`pollSlackSignals`) — calls `search.messages` for
//    explicit `<@self>` mentions and normalizes the matches into Signals.
//
// Identity rule (shared): one Signal per `(channel, thread_ts || ts)`.
// Replies fold into the parent row via upsert.

import type { Signal, SignalKind } from "#/lib/signal";

export type SlackEventPayload = {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  team?: string;
  event_ts?: string;
};

export type SlackNormalizeContext = {
  /** Owner's Slack user id (e.g. "U123"). */
  selfUserId: string;
  /** Channel ids in which @here / @channel become Signals. */
  broadcastAllowlist: ReadonlySet<string>;
  /** Channel ids where this user has previously posted in the thread (for thread_ts). */
  participatedThreads?: ReadonlySet<string>;
  /** Workspace id, used to build deep-links. */
  teamId?: string | null;
};

export function normalizeSlackEvent(
  event: SlackEventPayload,
  ctx: SlackNormalizeContext,
): Signal | null {
  if (event.type !== "message" && event.type !== "app_mention") return null;
  // Skip bot/system messages and edits/deletes.
  if (event.bot_id) return null;
  if (event.subtype && event.subtype !== "thread_broadcast") return null;
  if (event.user === ctx.selfUserId) return null;
  if (!event.channel || !event.ts || !event.user) return null;

  const text = event.text ?? "";
  const isDM = event.channel_type === "im";
  const mentionsSelf = text.includes(`<@${ctx.selfUserId}>`);
  const broadcasts = hasBroadcast(text);
  const threadParent = event.thread_ts;
  const isThreadReply = !!threadParent && threadParent !== event.ts;
  const inParticipatedThread =
    isThreadReply &&
    threadParent !== undefined &&
    ctx.participatedThreads?.has(threadKey(event.channel, threadParent)) ===
      true;

  let kind: SignalKind | null = null;
  if (isDM) kind = "dm";
  else if (event.type === "app_mention" || mentionsSelf) kind = "mention";
  else if (inParticipatedThread) kind = "thread_reply";
  else if (broadcasts && ctx.broadcastAllowlist.has(event.channel))
    kind = "mention";

  if (!kind) return null;

  // Identity = (channel, thread_ts || ts). Replies fold into the parent row.
  const anchorTs = event.thread_ts ?? event.ts;
  const sourceId = `${event.channel}:${anchorTs}`;
  const teamId = ctx.teamId ?? event.team ?? null;
  const url = teamId
    ? `https://app.slack.com/client/${teamId}/${event.channel}/thread/${event.channel}-${anchorTs}`
    : null;

  return {
    provider: "slack",
    kind,
    source_id: sourceId,
    title: titleFromText(text, kind),
    url,
    payload: {
      channel: event.channel,
      channel_type: event.channel_type ?? null,
      ts: event.ts,
      thread_ts: event.thread_ts ?? null,
      author: event.user,
      text,
      team: teamId,
    },
    requires_action: kind === "dm" || kind === "mention",
    source_created_at: tsToIso(anchorTs),
  };
}

const BROADCAST_RE = /<!(here|channel|everyone)(\|[^>]*)?>/;

function hasBroadcast(text: string): boolean {
  return BROADCAST_RE.test(text);
}

function titleFromText(text: string, kind: SignalKind): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    if (kind === "dm") return "(direct message)";
    if (kind === "mention") return "(mention)";
    return "(thread reply)";
  }
  return collapsed.length > 140 ? `${collapsed.slice(0, 139)}…` : collapsed;
}

function tsToIso(ts: string): string | null {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export function threadKey(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

// --- Polling surface (search.messages + conversations.replies) ------------
//
// The cron orchestrator calls this on every tick for connected Slack accounts.
// Three queries: explicit `<@self>` mentions and `is:dm` DMs (search.messages),
// plus per-thread reply pulls via `conversations.replies` for any thread the
// owner has previously posted in (tracked in `slack_participated_threads`).
// Identity rule is shared with the webhook path: `(channel, thread_ts || ts)`
// so a re-poll (or a webhook arriving for the same message) upserts into the
// same Signal row.

export type SlackSearchMatch = {
  type?: string;
  user?: string;
  channel?: { id?: string; name?: string };
  ts?: string;
  thread_ts?: string;
  text?: string;
  team?: string;
};

export type SlackSearchResponse = {
  ok?: boolean;
  error?: string;
  messages?: { matches?: SlackSearchMatch[] };
};

export type SlackReplyMessage = {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  team?: string;
};

export type SlackRepliesResponse = {
  ok?: boolean;
  error?: string;
  messages?: SlackReplyMessage[];
};

export type SlackParticipatedThread = {
  channel: string;
  thread_ts: string;
};

export type SlackPollOptions = {
  /** Threads the owner has posted in. For each, conversations.replies is
   *  fetched and any reply not authored by self becomes a thread_reply Signal
   *  on the parent's `(channel, thread_ts)` row. */
  participatedThreads?: ReadonlyArray<SlackParticipatedThread>;
};

export type SlackFetch = (
  url: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export async function pollSlackSignals(
  accessToken: string,
  selfUserId: string,
  fetchImpl: SlackFetch,
  options: SlackPollOptions = {},
): Promise<Signal[]> {
  const threads = options.participatedThreads ?? [];
  const [mentions, dms, threadReplies] = await Promise.all([
    runSearchQuery(accessToken, `<@${selfUserId}>`, fetchImpl),
    runSearchQuery(accessToken, "is:dm", fetchImpl),
    Promise.all(
      threads.map((t) =>
        runRepliesQuery(accessToken, t.channel, t.thread_ts, fetchImpl),
      ),
    ),
  ]);
  const out: Signal[] = [];
  for (const match of mentions) {
    const sig = normalizeSearchMatch(match, selfUserId, "mention");
    if (sig) out.push(sig);
  }
  for (const match of dms) {
    const sig = normalizeSearchMatch(match, selfUserId, "dm");
    if (sig) out.push(sig);
  }
  for (let i = 0; i < threads.length; i++) {
    const sig = normalizeThreadReplies(
      threads[i],
      threadReplies[i] ?? [],
      selfUserId,
    );
    if (sig) out.push(sig);
  }
  return out;
}

async function runSearchQuery(
  accessToken: string,
  query: string,
  fetchImpl: SlackFetch,
): Promise<SlackSearchMatch[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://slack.com/api/search.messages?query=${encoded}&count=100&sort=timestamp&sort_dir=desc`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new SlackPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as SlackSearchResponse;
  if (!body.ok) {
    throw new SlackPollError(res.status, body.error ?? "unknown");
  }
  return body.messages?.matches ?? [];
}

async function runRepliesQuery(
  accessToken: string,
  channel: string,
  thread_ts: string,
  fetchImpl: SlackFetch,
): Promise<SlackReplyMessage[]> {
  const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(
    channel,
  )}&ts=${encodeURIComponent(thread_ts)}&limit=100`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new SlackPollError(res.status, await safeText(res));
  }
  const body = (await res.json()) as SlackRepliesResponse;
  if (!body.ok) {
    throw new SlackPollError(res.status, body.error ?? "unknown");
  }
  return body.messages ?? [];
}

function normalizeThreadReplies(
  thread: SlackParticipatedThread,
  messages: SlackReplyMessage[],
  selfUserId: string,
): Signal | null {
  // Drop the parent (ts === thread_ts), bot/system/edit messages, and replies
  // authored by self. The remaining replies all dedupe into the same
  // (channel, thread_ts) row; the latest one supplies the rendered title.
  let latest: SlackReplyMessage | null = null;
  for (const msg of messages) {
    if (!msg.ts || !msg.user) continue;
    if (msg.ts === thread.thread_ts) continue;
    if (msg.user === selfUserId) continue;
    if (msg.bot_id) continue;
    if (msg.subtype && msg.subtype !== "thread_broadcast") continue;
    if (!latest || compareTs(msg.ts, latest.ts ?? "0") > 0) latest = msg;
  }
  if (!latest || !latest.ts || !latest.user) return null;
  const text = latest.text ?? "";
  const teamId = latest.team ?? null;
  const url = teamId
    ? `https://app.slack.com/client/${teamId}/${thread.channel}/thread/${thread.channel}-${thread.thread_ts}`
    : null;
  return {
    provider: "slack",
    kind: "thread_reply",
    source_id: `${thread.channel}:${thread.thread_ts}`,
    title: titleFromText(text, "thread_reply"),
    url,
    payload: {
      channel: thread.channel,
      channel_type: null,
      ts: latest.ts,
      thread_ts: thread.thread_ts,
      author: latest.user,
      text,
      team: teamId,
    },
    requires_action: false,
    source_created_at: tsToIso(latest.ts),
  };
}

function compareTs(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a.localeCompare(b);
  return na - nb;
}

function normalizeSearchMatch(
  match: SlackSearchMatch,
  selfUserId: string,
  kind: "mention" | "dm",
): Signal | null {
  const channel = match.channel?.id;
  if (!channel || !match.ts || !match.user) return null;
  if (match.user === selfUserId) return null;
  const text = match.text ?? "";
  if (kind === "mention" && !text.includes(`<@${selfUserId}>`)) return null;

  const anchorTs = match.thread_ts ?? match.ts;
  const teamId = match.team ?? null;
  const url = teamId
    ? `https://app.slack.com/client/${teamId}/${channel}/thread/${channel}-${anchorTs}`
    : null;

  return {
    provider: "slack",
    kind,
    source_id: `${channel}:${anchorTs}`,
    title: titleFromText(text, kind),
    url,
    payload: {
      channel,
      channel_type: kind === "dm" ? "im" : null,
      ts: match.ts,
      thread_ts: match.thread_ts ?? null,
      author: match.user,
      text,
      team: teamId,
    },
    requires_action: true,
    source_created_at: tsToIso(anchorTs),
  };
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export class SlackPollError extends Error {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`slack poll failed (${status}): ${body.slice(0, 200)}`);
    this.name = "SlackPollError";
  }
}
