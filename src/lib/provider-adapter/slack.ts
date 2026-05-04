// Slack provider adapter. Slack doesn't poll — events arrive at the Worker's
// /webhooks/slack endpoint via the Events API. This module is the pure
// translation step: a `message` / `app_mention` / threaded-reply event +
// the deployment owner's Slack user id + the channel allowlist → a Signal,
// or null when the event is not actionable for this user.
//
// Identity rule: one Signal per `(channel, thread_ts || ts)`. Replies in a
// thread the user is in upsert into the same row as the parent.

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
