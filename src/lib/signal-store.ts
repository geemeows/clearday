// Read/write boundary for Signals. Hides the JSONB shape from callers and
// guarantees idempotent upserts keyed on (provider, kind, source_id).
//
// The module takes a thin client interface so tests can drive it without
// pulling in the full Supabase JS client. In Worker context the cron uses
// the service-role client; in SPA context the user's session-scoped anon
// client is used (RLS gates writes/reads to the allowed user).

import { applyInboxRules, type InboxRule } from "#/lib/inbox-rules-engine";
import type {
  Signal,
  SignalKind,
  SignalProvider,
  StoredSignal,
} from "#/lib/signal";

type SupabaseLike = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => SelectChain;
    update: (values: Record<string, unknown>) => UpdateChain;
  };
};

type SelectChain = {
  is: (col: string, val: null) => SelectChain;
  in: (col: string, vals: string[]) => SelectChain;
  ilike: (col: string, pattern: string) => SelectChain;
  or: (filter: string) => SelectChain;
  gte: (col: string, val: string) => SelectChain;
  order: (col: string, opts: { ascending: boolean }) => SelectChain;
  limit: (n: number) => Promise<{
    data: StoredSignal[] | null;
    error: { message: string } | null;
  }>;
};

type UpdateChain = {
  eq: (
    col: string,
    val: string,
  ) => Promise<{ error: { message: string } | null }>;
};

export type UpsertSignalOptions = {
  /**
   * Inbox rules evaluated against the Signal before write. Effects are mapped
   * to columns: auto_dismiss → dismissed_at, snooze → snoozed_until, tag →
   * tags. Columns are only included in the upsert when their effect fires,
   * so re-upserts that match no rules don't clobber existing overrides.
   */
  rules?: InboxRule[];
  now?: Date;
};

export async function upsertSignal(
  client: SupabaseLike,
  signal: Signal,
  options: UpsertSignalOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const application = options.rules
    ? applyInboxRules(signal, options.rules, now)
    : null;

  const values: Record<string, unknown> = {
    provider: signal.provider,
    kind: signal.kind,
    source_id: signal.source_id,
    title: signal.title,
    url: signal.url,
    payload: signal.payload,
    requires_action: signal.requires_action,
    source_created_at: signal.source_created_at,
    updated_at: nowIso,
  };
  if (application) {
    if (application.dismissed) values.dismissed_at = nowIso;
    if (application.snoozed_until)
      values.snoozed_until = application.snoozed_until;
    if (application.tags.length > 0) values.tags = application.tags;
  }

  const { error } = await client
    .from("signals")
    .upsert(values, { onConflict: "provider,kind,source_id" });
  if (error) throw new Error(`signal upsert failed: ${error.message}`);
}

export type ListSignalsArgs = {
  kinds?: SignalKind[];
  providers?: SignalProvider[];
  includeDismissed?: boolean;
  /** Case-insensitive substring match against `title`. */
  query?: string;
  /** Include signals whose `snoozed_until` is in the future. Default: false. */
  includeSnoozed?: boolean;
  /** ISO timestamp; rows with `source_created_at` strictly before are dropped. */
  since?: string;
  limit?: number;
  now?: Date;
};

export async function listSignals(
  client: SupabaseLike,
  args: ListSignalsArgs = {},
): Promise<StoredSignal[]> {
  let q = client.from("signals").select("*");
  if (!args.includeDismissed) q = q.is("dismissed_at", null);
  if (!args.includeSnoozed) {
    const nowIso = (args.now ?? new Date()).toISOString();
    q = q.or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`);
  }
  if (args.kinds && args.kinds.length > 0) q = q.in("kind", args.kinds);
  if (args.providers && args.providers.length > 0)
    q = q.in("provider", args.providers);
  if (args.query && args.query.trim().length > 0) {
    q = q.ilike("title", `%${escapeLikePattern(args.query.trim())}%`);
  }
  if (args.since) q = q.gte("source_created_at", args.since);
  q = q.order("source_created_at", { ascending: false });
  const { data, error } = await q.limit(args.limit ?? 200);
  if (error) throw new Error(`signal list failed: ${error.message}`);
  return data ?? [];
}

function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function dismissSignal(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("signals")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`signal dismiss failed: ${error.message}`);
}

/**
 * Flip `requires_action` to false on the matching Signal so the optimistic
 * "Replied" state in the inbox survives a reload. Used by the PR-review and
 * Slack-reply HTTP handlers after a successful upstream send.
 */
export async function markSignalReplied(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("signals")
    .update({
      requires_action: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`signal mark replied failed: ${error.message}`);
}

export type { SupabaseLike };
