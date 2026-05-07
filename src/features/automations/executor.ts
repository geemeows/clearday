// Automation executor.
//
// One row per fired automation lands in `automation_runs`, keyed on
// `(automation_id, trigger_event_id)`. The unique index is the only thing
// guarding against duplicate dispatch — re-polls of the same Signal call the
// executor again, but the conflict-on-insert short-circuits to
// `skipped_idempotent`.
//
// v1's actions are all "internal": dismiss / snooze / tag / set_priority /
// set_channels. The signal-store upsert seam already applied them as columns
// on the Signal row at insert time (atomic with the upsert), so there's no
// further capability call to make here. The executor just records the run
// outcome. Future provider actions (Slack `post_message`, GitHub
// `comment_on_pr`, …) plug into the same shape: the action handler returns
// either `{ ok: true, ref?: ... }` or `{ ok: false, error: string }` and the
// executor stamps the matching status.
//
// All Supabase access is injected via a thin store interface so the module
// stays unit-testable without supabase-js.

import type {
  AutomationAction,
  PlannedAutomation,
} from "#/features/automations/engine";

export type AutomationRunStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "skipped_dry_run"
  | "skipped_idempotent";

export type AutomationRunInsert = {
  automation_id: string;
  trigger_event_id: string;
  signal_id: string | null;
  status: AutomationRunStatus;
  actions_planned: AutomationAction[];
  actions_executed: ExecutedAction[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type ExecutedAction = {
  type: AutomationAction["type"];
  ok: boolean;
  ref?: Record<string, unknown>;
  error?: string;
};

export type AutomationRunsStore = {
  /**
   * Insert one run row keyed on `(automation_id, trigger_event_id)`.
   * Returns true when the row was newly inserted, false on unique-key
   * conflict (duplicate dispatch — caller short-circuits to
   * `skipped_idempotent`).
   */
  insertIfNew: (row: AutomationRunInsert) => Promise<boolean>;
};

export type ActionHandler = (
  action: AutomationAction,
  ctx: ExecuteCtx,
) => Promise<ExecutedAction>;

export type ExecuteCtx = {
  signalId: string | null;
  triggerEventId: string;
  /**
   * Whether the v1 internal actions should be considered already-applied at
   * the Signal upsert seam. Kept as a flag so a future trigger that fires
   * outside the upsert (e.g. `signal_state_change`) can opt the executor
   * back into doing the column writes itself.
   */
  internalActionsAppliedByUpsert: boolean;
};

export const DEFAULT_INTERNAL_HANDLER: ActionHandler = async (action, ctx) => {
  // For v1, internal actions land as columns on the Signal row at upsert
  // time (see features/signals/store.ts → applyAutomationsToSignal).
  // Re-applying here would be a redundant round-trip, so the executor just
  // records the action as executed when the upsert seam owned the write.
  if (ctx.internalActionsAppliedByUpsert) {
    return { type: action.type, ok: true };
  }
  // No non-upsert path in v1. Future trigger kinds will swap in a real
  // handler that performs the column write directly.
  return { type: action.type, ok: true };
};

export type ExecuteOptions = {
  dryRun?: boolean;
  /**
   * When falsy, the executor flags internal actions as already-applied (the
   * upsert seam wrote the columns). Tests pass `false` to opt the executor
   * into running its own handler chain.
   */
  internalActionsAppliedByUpsert?: boolean;
  handler?: ActionHandler;
  now?: () => Date;
};

export type ExecuteInput = {
  plan: PlannedAutomation;
  triggerEventId: string;
  signalId: string | null;
};

export type ExecuteResult = {
  automation_id: string;
  status: AutomationRunStatus;
  executed: ExecutedAction[];
  error: string | null;
};

export async function executeAutomation(
  input: ExecuteInput,
  store: AutomationRunsStore,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const handler = options.handler ?? DEFAULT_INTERNAL_HANDLER;
  const internalApplied = options.internalActionsAppliedByUpsert ?? true;

  const ctx: ExecuteCtx = {
    signalId: input.signalId,
    triggerEventId: input.triggerEventId,
    internalActionsAppliedByUpsert: internalApplied,
  };

  if (options.dryRun) {
    const inserted = await store.insertIfNew({
      automation_id: input.plan.automation_id,
      trigger_event_id: input.triggerEventId,
      signal_id: input.signalId,
      status: "skipped_dry_run",
      actions_planned: input.plan.actions,
      actions_executed: [],
      error: null,
      started_at: startedAt,
      finished_at: now().toISOString(),
    });
    if (!inserted) {
      return idempotent(input.plan.automation_id);
    }
    return {
      automation_id: input.plan.automation_id,
      status: "skipped_dry_run",
      executed: [],
      error: null,
    };
  }

  const executed: ExecutedAction[] = [];
  let firstError: string | null = null;
  for (const action of input.plan.actions) {
    try {
      const out = await handler(action, ctx);
      executed.push(out);
      if (!out.ok && firstError === null) {
        firstError = out.error ?? `action ${action.type} failed`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      executed.push({ type: action.type, ok: false, error: message });
      if (firstError === null) firstError = message;
    }
  }

  const status: AutomationRunStatus = firstError ? "failed" : "succeeded";
  const finishedAt = now().toISOString();
  const inserted = await store.insertIfNew({
    automation_id: input.plan.automation_id,
    trigger_event_id: input.triggerEventId,
    signal_id: input.signalId,
    status,
    actions_planned: input.plan.actions,
    actions_executed: executed,
    error: firstError,
    started_at: startedAt,
    finished_at: finishedAt,
  });
  if (!inserted) {
    // Conflict: a concurrent run for the same (automation, trigger_event)
    // already landed. Drop our work — the first insert wins.
    return idempotent(input.plan.automation_id);
  }
  return {
    automation_id: input.plan.automation_id,
    status,
    executed,
    error: firstError,
  };
}

function idempotent(automationId: string): ExecuteResult {
  return {
    automation_id: automationId,
    status: "skipped_idempotent",
    executed: [],
    error: null,
  };
}
