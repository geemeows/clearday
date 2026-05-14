// Client-side query module for automation_runs. Takes a narrow client interface
// so tests can drive it without the real SDK. Returns rows ordered newest-first.

import type { AutomationRunRow } from "#/features/automations/api";
import type { SelectChain } from "#/shared/db";

/** Narrow client interface — only the select chain is needed here. */
export type RunsQueryClient = {
  from: (table: string) => { select: (cols: string) => SelectChain };
};

export type { AutomationRunRow };

/**
 * List runs for one automation, newest first.
 * `before` is a `started_at` ISO cursor — returns rows strictly older than it.
 */
export async function listRuns(
  client: RunsQueryClient,
  automationId: string,
  opts?: { limit?: number; before?: string },
): Promise<AutomationRunRow[]> {
  const limit = Math.min(opts?.limit ?? 25, 100);
  let q = client
    .from("automation_runs")
    .select(
      "id, automation_id, trigger_event_id, signal_id, status, actions_planned, actions_executed, error, started_at, finished_at",
    )
    .eq("automation_id", automationId)
    .order("started_at", { ascending: false });
  if (opts?.before !== undefined) q = q.lt("started_at", opts.before);
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(`automation runs query failed: ${error.message}`);
  return (data ?? []) as AutomationRunRow[];
}
