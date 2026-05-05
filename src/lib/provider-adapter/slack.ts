// Slack provider adapter. Two surfaces share the same Signal shape:
//
// 1. Webhook event normalization (`normalizeSlackEvent`) — translates a single
//    `message` / `app_mention` Events API payload into a Signal.
// 2. Cron-driven polling (`pollSlackSignals`) — scans `conversations.history`
//    over the channels and DMs the user is in (free-plan compatible).
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

// --- Polling surface (users.conversations + conversations.history) -----
//
// The cron orchestrator calls this on every tick for connected Slack accounts.
// Free-plan-compatible: uses only `users.conversations`, `conversations.history`
// and `conversations.replies` — no `search.messages` (which is paid-only).
//
// Per tick:
//   1. List the user's channels (public/private/mpim) and DMs (im).
//   2. For each channel: pull `conversations.history` since `now - window` and
//      emit `mention` Signals for messages containing `<@selfUserId>` (and for
//      `@here`/`@channel` only when the channel is in the broadcast allowlist).
//   3. For each DM channel: pull `conversations.history` since `now - window`
//      and emit `dm` Signals for every non-self, non-bot message.
//   4. For each participated thread: pull `conversations.replies` and emit a
//      `thread_reply` Signal for the latest non-self reply.
//
// Identity rule is shared with the webhook path: `(channel, thread_ts || ts)`,
// so a re-poll within the overlap window upserts the same Signal row instead
// of duplicating it.

export type SlackConversation = {
  id?: string;
  name?: string;
  is_archived?: boolean;
  is_im?: boolean;
};

export type SlackConversationsListResponse = {
  ok?: boolean;
  error?: string;
  channels?: SlackConversation[];
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

export type SlackHistoryMessage = {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  ts?: string;
  thread_ts?: string;
  text?: string;
  team?: string;
};

export type SlackHistoryResponse = {
  ok?: boolean;
  error?: string;
  messages?: SlackHistoryMessage[];
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
  /** Channel ids opted in to capture `@here` / `@channel` broadcasts. In other
   *  channels, broadcast tokens are dropped — direct `<@self>` mentions still
   *  fire regardless of allowlist. Mirrors the webhook's `broadcastAllowlist`
   *  gate so polling matches webhook semantics. */
  broadcastChannels?: ReadonlyArray<string>;
  /** Wall clock for computing the history `oldest` cutoff. Defaults to now. */
  now?: Date;
  /** History oldest window in seconds (default 120 = the cron interval).
   *  Bounds Supabase write volume: every channel scan is capped at the last
   *  `historyWindowSec` seconds of messages. */
  historyWindowSec?: number;
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
  const now = options.now ?? new Date();
  const windowSec = options.historyWindowSec ?? 120;
  const oldest = (now.getTime() / 1000 - windowSec).toFixed(6);
  const broadcastSet = new Set(options.broadcastChannels ?? []);
  const threads = options.participatedThreads ?? [];

  const [channels, ims, threadReplies] = await Promise.all([
    listConversations(
      accessToken,
      "public_channel,private_channel,mpim",
      fetchImpl,
    ),
    listConversations(accessToken, "im", fetchImpl),
    Promise.all(
      threads.map((t) =>
        runRepliesQuery(accessToken, t.channel, t.thread_ts, fetchImpl),
      ),
    ),
  ]);

  const channelNames = new Map<string, string>();
  for (const c of channels) if (c.name) channelNames.set(c.id, c.name);

  const channelHistories = await Promise.all(
    channels.map((c) => runHistoryQuery(accessToken, c.id, fetchImpl, oldest)),
  );
  const imHistories = await Promise.all(
    ims.map((c) => runHistoryQuery(accessToken, c.id, fetchImpl, oldest)),
  );

  const out: Signal[] = [];
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    if (!channel) continue;
    const allowBroadcast = broadcastSet.has(channel.id);
    for (const msg of channelHistories[i] ?? []) {
      const sig = normalizeChannelMessage(
        channel.id,
        msg,
        selfUserId,
        allowBroadcast,
      );
      if (sig) out.push(sig);
    }
  }
  for (let i = 0; i < ims.length; i++) {
    const channel = ims[i];
    if (!channel) continue;
    for (const msg of imHistories[i] ?? []) {
      const sig = normalizeDmMessage(channel.id, msg, selfUserId);
      if (sig) out.push(sig);
    }
  }
  for (let i = 0; i < threads.length; i++) {
    const sig = normalizeThreadReplies(
      threads[i],
      threadReplies[i] ?? [],
      selfUserId,
    );
    if (sig) out.push(sig);
  }

  // Resolve user-ids to display names: senders (payload.author) plus every
  // `<@U…>` mention referenced inside a message body. Then substitute mentions
  // in title + text and stamp `author_name` / `channel_name` for the UI.
  const userIds = new Set<string>();
  for (const sig of out) {
    const author = sig.payload.author;
    if (typeof author === "string" && author) userIds.add(author);
    const text = sig.payload.text;
    if (typeof text === "string") {
      for (const m of text.matchAll(USER_MENTION_RE)) {
        if (m[1]) userIds.add(m[1]);
      }
    }
  }
  const userNames =
    userIds.size > 0
      ? await resolveUserNames(accessToken, userIds, fetchImpl)
      : new Map<string, string>();

  for (const sig of out) {
    const author = sig.payload.author;
    if (typeof author === "string" && userNames.has(author)) {
      sig.payload.author_name = userNames.get(author);
    }
    const ch = sig.payload.channel;
    if (typeof ch === "string" && channelNames.has(ch)) {
      sig.payload.channel_name = channelNames.get(ch);
    }
    if (typeof sig.payload.text === "string") {
      sig.payload.text = substituteMentions(sig.payload.text, userNames);
    }
    sig.title = substituteMentions(sig.title, userNames);
    if (
      sig.title &&
      sig.title.length > 140 &&
      typeof sig.payload.text === "string"
    ) {
      sig.title = `${sig.title.slice(0, 139)}…`;
    }
  }
  return out;
}

const USER_MENTION_RE = /<@([UW][A-Z0-9]+)>/g;

function substituteMentions(
  text: string,
  names: ReadonlyMap<string, string>,
): string {
  return text.replace(USER_MENTION_RE, (raw, id: string) => {
    const name = names.get(id);
    return name ? `@${name}` : raw;
  });
}

async function resolveUserNames(
  accessToken: string,
  ids: ReadonlySet<string>,
  fetchImpl: SlackFetch,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const name = await runUsersInfo(accessToken, id, fetchImpl);
        if (name) out.set(id, name);
      } catch {
        // users.info is best-effort — a missing name falls back to the raw
        // `<@id>` rendering rather than failing the whole poll.
      }
    }),
  );
  return out;
}

async function runUsersInfo(
  accessToken: string,
  userId: string,
  fetchImpl: SlackFetch,
): Promise<string | null> {
  const url = `https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    ok?: boolean;
    user?: {
      real_name?: string;
      name?: string;
      profile?: { display_name?: string; real_name?: string };
    };
  };
  if (!body.ok || !body.user) return null;
  return (
    body.user.profile?.display_name ||
    body.user.profile?.real_name ||
    body.user.real_name ||
    body.user.name ||
    null
  );
}

async function listConversations(
  accessToken: string,
  types: string,
  fetchImpl: SlackFetch,
): Promise<Array<{ id: string; name?: string }>> {
  const url = `https://slack.com/api/users.conversations?types=${encodeURIComponent(
    types,
  )}&exclude_archived=true&limit=200`;
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
  const body = (await res.json()) as SlackConversationsListResponse;
  if (!body.ok) {
    throw new SlackPollError(res.status, body.error ?? "unknown");
  }
  const out: Array<{ id: string; name?: string }> = [];
  for (const c of body.channels ?? []) {
    if (c.is_archived) continue;
    if (!c.id) continue;
    out.push(c.name ? { id: c.id, name: c.name } : { id: c.id });
  }
  return out;
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

async function runHistoryQuery(
  accessToken: string,
  channel: string,
  fetchImpl: SlackFetch,
  oldest?: string,
): Promise<SlackHistoryMessage[]> {
  const oldestParam = oldest ? `&oldest=${encodeURIComponent(oldest)}` : "";
  const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(
    channel,
  )}&limit=100${oldestParam}`;
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
  const body = (await res.json()) as SlackHistoryResponse;
  if (!body.ok) {
    throw new SlackPollError(res.status, body.error ?? "unknown");
  }
  return body.messages ?? [];
}

function normalizeChannelMessage(
  channel: string,
  msg: SlackHistoryMessage,
  selfUserId: string,
  allowBroadcast: boolean,
): Signal | null {
  if (!msg.ts || !msg.user) return null;
  if (msg.user === selfUserId) return null;
  if (msg.bot_id) return null;
  if (msg.subtype && msg.subtype !== "thread_broadcast") return null;
  const text = msg.text ?? "";
  const directMention = text.includes(`<@${selfUserId}>`);
  const broadcast = allowBroadcast && BROADCAST_RE.test(text);
  if (!directMention && !broadcast) return null;

  const anchorTs = msg.thread_ts ?? msg.ts;
  const teamId = msg.team ?? null;
  const url = teamId
    ? `https://app.slack.com/client/${teamId}/${channel}/thread/${channel}-${anchorTs}`
    : null;
  return {
    provider: "slack",
    kind: "mention",
    source_id: `${channel}:${anchorTs}`,
    title: titleFromText(text, "mention"),
    url,
    payload: {
      channel,
      channel_type: null,
      ts: msg.ts,
      thread_ts: msg.thread_ts ?? null,
      author: msg.user,
      text,
      team: teamId,
    },
    requires_action: true,
    source_created_at: tsToIso(anchorTs),
  };
}

function normalizeDmMessage(
  channel: string,
  msg: SlackHistoryMessage,
  selfUserId: string,
): Signal | null {
  if (!msg.ts || !msg.user) return null;
  if (msg.user === selfUserId) return null;
  if (msg.bot_id) return null;
  if (msg.subtype && msg.subtype !== "thread_broadcast") return null;
  const text = msg.text ?? "";

  const anchorTs = msg.thread_ts ?? msg.ts;
  const teamId = msg.team ?? null;
  const url = teamId
    ? `https://app.slack.com/client/${teamId}/${channel}/thread/${channel}-${anchorTs}`
    : null;
  return {
    provider: "slack",
    kind: "dm",
    source_id: `${channel}:${anchorTs}`,
    title: titleFromText(text, "dm"),
    url,
    payload: {
      channel,
      channel_type: "im",
      ts: msg.ts,
      thread_ts: msg.thread_ts ?? null,
      author: msg.user,
      text,
      team: teamId,
    },
    requires_action: true,
    source_created_at: tsToIso(anchorTs),
  };
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
