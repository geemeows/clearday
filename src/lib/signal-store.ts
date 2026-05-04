// Read/write boundary for Signals. Hides the JSONB shape from callers and
// guarantees idempotent upserts keyed on (provider, kind, source_id).
//
// The module takes a thin client interface so tests can drive it without
// pulling in the full Supabase JS client. In Worker context the cron uses
// the service-role client; in SPA context the user's session-scoped anon
// client is used (RLS gates writes/reads to the allowed user).

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

export async function upsertSignal(
  client: SupabaseLike,
  signal: Signal,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await client.from("signals").upsert(
    {
      provider: signal.provider,
      kind: signal.kind,
      source_id: signal.source_id,
      title: signal.title,
      url: signal.url,
      payload: signal.payload,
      requires_action: signal.requires_action,
      source_created_at: signal.source_created_at,
      updated_at: now,
    },
    { onConflict: "provider,kind,source_id" },
  );
  if (error) throw new Error(`signal upsert failed: ${error.message}`);
}

export type ListSignalsArgs = {
  kinds?: SignalKind[];
  providers?: SignalProvider[];
  includeDismissed?: boolean;
  /** Case-insensitive substring match against `title`. */
  query?: string;
  limit?: number;
};

export async function listSignals(
  client: SupabaseLike,
  args: ListSignalsArgs = {},
): Promise<StoredSignal[]> {
  let q = client.from("signals").select("*");
  if (!args.includeDismissed) q = q.is("dismissed_at", null);
  if (args.kinds && args.kinds.length > 0) q = q.in("kind", args.kinds);
  if (args.providers && args.providers.length > 0)
    q = q.in("provider", args.providers);
  if (args.query && args.query.trim().length > 0) {
    q = q.ilike("title", `%${escapeLikePattern(args.query.trim())}%`);
  }
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

export type { SupabaseLike };
