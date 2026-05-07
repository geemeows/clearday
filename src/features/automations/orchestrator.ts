// Automation orchestrator. The only impure glue around the engine and
// executor.
//
// The integrations cron orchestrator calls `runSignalIngestedAutomations`
// after a poll batch upserts a set of Signals. For each freshly-inserted
// Signal the orchestrator (a) plans the automations the engine matches, then
// (b) hands each plan to the executor which records a run row keyed on
// `(automation_id, trigger_event_id)`. The unique index makes the whole pass
// safe to re-run if the same Signal turns up on the next minute's poll.
//
// `signal_ingested` fires once on first insert. The simplest way to detect
// "first insert" without changing the upsert primitive is to compare the
// row's created_at vs updated_at: equal means the upsert was an INSERT, the
// `0014_signals_unread_count_bump.sql` trigger only fires on UPDATE so it
// never touches first-insert created_at. Callers that already know which
// Signals were inserted can pass them in directly via
// `runAutomationsForInsertedSignals`.

import {
  type Automation,
  type SignalStateChangeEvent,
  planAutomations,
} from "#/features/automations/engine";
import {
  type AutomationRunsStore,
  type ExecuteOptions,
  type ExecuteResult,
  executeAutomation,
} from "#/features/automations/executor";
import { triggerEventId } from "#/features/automations/triggers";
import type { Signal, StoredSignal } from "#/shared/signal";

export type SignalLookup = {
  /**
   * Resolve the inserted-vs-updated state of every Signal in `keys`. Returns
   * the StoredSignal rows so the orchestrator can build trigger event ids.
   */
  resolve: (
    keys: Array<Pick<Signal, "provider" | "kind" | "source_id">>,
  ) => Promise<StoredSignal[]>;
};

export type RunAutomationsResult = {
  signalId: string;
  results: ExecuteResult[];
};

export async function runAutomationsForInsertedSignals(
  signals: StoredSignal[],
  automations: Automation[],
  store: AutomationRunsStore,
  options: ExecuteOptions = {},
): Promise<RunAutomationsResult[]> {
  const reports: RunAutomationsResult[] = [];
  for (const stored of signals) {
    const event = { kind: "signal_ingested" as const, signal: stored };
    const planned = planAutomations(event, automations);
    if (planned.length === 0) {
      reports.push({ signalId: stored.id, results: [] });
      continue;
    }
    const eventId = triggerEventId(event, stored.id, stored.created_at);
    const results: ExecuteResult[] = [];
    for (const plan of planned) {
      const result = await executeAutomation(
        { plan, triggerEventId: eventId, signalId: stored.id },
        store,
        options,
      );
      results.push(result);
    }
    reports.push({ signalId: stored.id, results });
  }
  return reports;
}

/**
 * UPDATE-path counterpart of `runAutomationsForInsertedSignals`. Each pair
 * carries the pre-update Signal alongside the post-update StoredSignal so
 * `state_from_to` predicates can compare the two. The trigger event id is
 * `${after.id}:${after.updated_at}` — re-polling an already-updated row
 * yields the same id and the executor short-circuits to
 * `skipped_idempotent`.
 */
export async function runAutomationsForUpdatedSignals(
  pairs: Array<{ before: Signal; after: StoredSignal }>,
  automations: Automation[],
  store: AutomationRunsStore,
  options: ExecuteOptions = {},
): Promise<RunAutomationsResult[]> {
  const reports: RunAutomationsResult[] = [];
  for (const { before, after } of pairs) {
    const event: SignalStateChangeEvent = {
      kind: "signal_state_change",
      before,
      after,
    };
    const planned = planAutomations(event, automations);
    if (planned.length === 0) {
      reports.push({ signalId: after.id, results: [] });
      continue;
    }
    const eventId = triggerEventId(event, after.id, after.updated_at);
    const results: ExecuteResult[] = [];
    for (const plan of planned) {
      const result = await executeAutomation(
        { plan, triggerEventId: eventId, signalId: after.id },
        store,
        options,
      );
      results.push(result);
    }
    reports.push({ signalId: after.id, results });
  }
  return reports;
}

/**
 * Thin glue used by the cron orchestrator: takes the input Signals (the ones
 * just upserted), reads back StoredSignal rows, filters down to the ones
 * that look freshly inserted (created_at == updated_at), and dispatches.
 */
export async function runSignalIngestedAutomations(
  signals: Signal[],
  automations: Automation[],
  lookup: SignalLookup,
  store: AutomationRunsStore,
  options: ExecuteOptions = {},
): Promise<RunAutomationsResult[]> {
  if (signals.length === 0 || automations.length === 0) return [];
  const stored = await lookup.resolve(
    signals.map((s) => ({
      provider: s.provider,
      kind: s.kind,
      source_id: s.source_id,
    })),
  );
  const inserted = stored.filter((s) => s.created_at === s.updated_at);
  return runAutomationsForInsertedSignals(
    inserted,
    automations,
    store,
    options,
  );
}
