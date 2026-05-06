// Slack-specific per-poll state. Loaded once per cron tick; reflects
// `slack_participated_threads` and `slack_channel_allowlist`. The poll
// returns a delta of newly-discovered threads which `saveState` upserts
// back into `slack_participated_threads`.

import type { SupabaseLike } from "#/lib/signal-store";

export type SlackParticipatedThreadRef = {
  channel: string;
  thread_ts: string;
};

export type SlackState = {
  /** Slack `authed_user.id` from the OAuth exchange. Required for the
   *  `<@self>` mention query. */
  accountId: string;
  threads: SlackParticipatedThreadRef[];
  allowlist: string[];
};

export type SlackDelta = {
  discoveredThreads: SlackParticipatedThreadRef[];
};

// biome-ignore lint/suspicious/noExplicitAny: thin Supabase surface
type Service = any;

export async function loadParticipatedThreads(
  service: Service,
): Promise<SlackParticipatedThreadRef[]> {
  const { data, error } = await service
    .from("slack_participated_threads")
    .select("channel, thread_ts");
  if (error) throw new Error(error.message);
  return (data ?? []) as SlackParticipatedThreadRef[];
}

export async function loadBroadcastAllowlist(
  service: Service,
): Promise<string[]> {
  const { data, error } = await service
    .from("slack_channel_allowlist")
    .select("channel_id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ channel_id: string }>).map(
    (r) => r.channel_id,
  );
}

export async function saveParticipatedThreads(
  service: Service,
  threads: ReadonlyArray<SlackParticipatedThreadRef>,
): Promise<void> {
  if (threads.length === 0) return;
  const rows = threads.map((t) => ({
    channel: t.channel,
    thread_ts: t.thread_ts,
  }));
  const { error } = await service
    .from("slack_participated_threads")
    .upsert(rows, {
      onConflict: "channel,thread_ts",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
}

/**
 * Loads the full SlackState for one provider_accounts row. The accountId is
 * passed in because it's pulled from the row, not the database tables.
 */
export async function loadSlackState(deps: {
  supabase: SupabaseLike;
  accountId: string;
}): Promise<SlackState> {
  const [threads, allowlist] = await Promise.all([
    loadParticipatedThreads(deps.supabase),
    loadBroadcastAllowlist(deps.supabase),
  ]);
  return { accountId: deps.accountId, threads, allowlist };
}

export async function saveSlackState(
  deps: { supabase: SupabaseLike },
  delta: SlackDelta,
): Promise<void> {
  await saveParticipatedThreads(deps.supabase, delta.discoveredThreads);
}
