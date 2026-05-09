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

import { ACTIONS } from "#/features/automations/actions";
import type {
  AutomationAction,
  PlannedAutomation,
} from "#/features/automations/engine";
import type { Signal } from "#/shared/signal";

export type AutomationRunStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "skipped_dry_run"
  | "skipped_idempotent"
  | "skipped_no_capability";

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
   * Triggering Signal, when one exists (signal_ingested / signal_state_change).
   * Null for focus / schedule events. External-action handlers consult it for
   * templating substitution and for default repo/number derivation.
   */
  signal: Signal | null;
  /**
   * Whether the v1 internal actions should be considered already-applied at
   * the Signal upsert seam. Kept as a flag so a future trigger that fires
   * outside the upsert (e.g. `signal_state_change`) can opt the executor
   * back into doing the column writes itself.
   */
  internalActionsAppliedByUpsert: boolean;
  /**
   * Active Focus session id at the time of dispatch, when one is active.
   * Threaded through so the executor can enforce a soft idempotency key
   * `(focus_session_id, slack_thread_ts)` on auto-reply post_message actions
   * — distinct from the hard `(automation_id, trigger_event_id)` index since
   * a Focus session spans many trigger events (issue #94).
   */
  activeFocusSessionId: string | null;
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

export type RateLimitDecision = { ok: true } | { ok: false; error: string };

/**
 * Per-user action-rate ceiling. The executor consults the limiter once per
 * dispatch (after the deferred / dry-run short-circuits) with the action
 * count of the plan; an `ok: false` decision short-circuits to a `failed` run
 * with the limiter's structured error so the overflow lands in the runs view
 * rather than silently dropping. Distinct from the unique-index idempotency
 * guard — that's per `(automation_id, trigger_event_id)`, this is per-window
 * across all automations sharing the limiter.
 */
export type RateLimiter = {
  tryConsume: (actionCount: number, now: Date) => RateLimitDecision;
};

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

/**
 * Fixed 1-minute bucket counter. Buckets reset on minute boundaries
 * (`Math.floor(now/60_000)`); a request whose action count would push the
 * bucket past `perMinute` is denied and the count for the bucket is left
 * untouched (so the next call within the same minute can still consume up
 * to the remainder).
 */
export function inMemoryRateLimiter(
  opts: { perMinute?: number } = {},
): RateLimiter {
  const perMinute = opts.perMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  let bucketKey = -1;
  let count = 0;
  return {
    tryConsume: (actionCount, now) => {
      const k = Math.floor(now.getTime() / 60_000);
      if (k !== bucketKey) {
        bucketKey = k;
        count = 0;
      }
      if (count + actionCount > perMinute) {
        return {
          ok: false,
          error: `rate_limit_exceeded: ${perMinute} actions/minute`,
        };
      }
      count += actionCount;
      return { ok: true };
    },
  };
}

/**
 * Soft idempotency for the Focus auto-reply flow (issue #94). Reserves a
 * `(focus_session_id, slack_thread_ts)` pair so a Focus-active automation that
 * fires on `signal_ingested` for repeated `slack_dm`/`slack_mention` events in
 * the same thread posts at most once per thread per session.
 *
 * `reserve` returns true when the pair is newly recorded, false when it was
 * already present (the executor short-circuits to `skipped_idempotent` on a
 * false return).
 */
export type FocusReplyDedupe = {
  reserve: (focusSessionId: string, slackThreadTs: string) => Promise<boolean>;
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
  rateLimiter?: RateLimiter;
  focusReplyDedupe?: FocusReplyDedupe;
};

export type ExecuteInput = {
  plan: PlannedAutomation;
  triggerEventId: string;
  signalId: string | null;
  /**
   * Triggering Signal when the event carries one (signal_ingested /
   * signal_state_change). Threaded into ExecuteCtx for handlers that need
   * the Signal payload (templating, default repo/number derivation).
   */
  signal?: Signal | null;
  /**
   * Active Focus session id when one is open at dispatch time. Threaded into
   * ExecuteCtx so the executor can apply the auto-reply soft idempotency
   * check (issue #94).
   */
  activeFocusSessionId?: string | null;
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
    signal: input.signal ?? null,
    internalActionsAppliedByUpsert: internalApplied,
    activeFocusSessionId: input.activeFocusSessionId ?? null,
  };

  // Plans whose every action is `deferred` (e.g. `transition_ticket` ahead of
  // a Linear/Jira capability) short-circuit to `skipped_no_capability`. The
  // run row still lands so the user sees the deferred dispatch in the runs
  // view; once a capability registers, this branch falls away.
  if (
    input.plan.actions.length > 0 &&
    input.plan.actions.every((a) => ACTIONS[a.type]?.kind === "deferred")
  ) {
    const inserted = await store.insertIfNew({
      automation_id: input.plan.automation_id,
      trigger_event_id: input.triggerEventId,
      signal_id: input.signalId,
      status: "skipped_no_capability",
      actions_planned: input.plan.actions,
      actions_executed: [],
      error: null,
      started_at: startedAt,
      finished_at: now().toISOString(),
    });
    if (!inserted) return idempotent(input.plan.automation_id);
    return {
      automation_id: input.plan.automation_id,
      status: "skipped_no_capability",
      executed: [],
      error: null,
    };
  }

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

  // Soft idempotency for the Focus auto-reply flow (issue #94). When a Focus
  // session is open and the plan posts a Slack thread reply, reserve the
  // (focus_session_id, slack_thread_ts) pair before any side effects fire. A
  // duplicate reservation short-circuits to skipped_idempotent — distinct from
  // the hard (automation_id, trigger_event_id) index because a Focus session
  // spans many trigger events (one per inbound DM/mention in the thread).
  if (
    options.focusReplyDedupe &&
    ctx.activeFocusSessionId &&
    ctx.signal &&
    input.plan.actions.some(isThreadReplyAutoReply)
  ) {
    const threadTs = slackThreadTs(ctx.signal);
    if (threadTs) {
      const reserved = await options.focusReplyDedupe.reserve(
        ctx.activeFocusSessionId,
        threadTs,
      );
      if (!reserved) {
        const finishedAt = now().toISOString();
        const inserted = await store.insertIfNew({
          automation_id: input.plan.automation_id,
          trigger_event_id: input.triggerEventId,
          signal_id: input.signalId,
          status: "skipped_idempotent",
          actions_planned: input.plan.actions,
          actions_executed: [],
          error: null,
          started_at: startedAt,
          finished_at: finishedAt,
        });
        if (!inserted) return idempotent(input.plan.automation_id);
        return {
          automation_id: input.plan.automation_id,
          status: "skipped_idempotent",
          executed: [],
          error: null,
        };
      }
    }
  }

  if (options.rateLimiter && input.plan.actions.length > 0) {
    const decision = options.rateLimiter.tryConsume(
      input.plan.actions.length,
      now(),
    );
    if (!decision.ok) {
      const finishedAt = now().toISOString();
      const inserted = await store.insertIfNew({
        automation_id: input.plan.automation_id,
        trigger_event_id: input.triggerEventId,
        signal_id: input.signalId,
        status: "failed",
        actions_planned: input.plan.actions,
        actions_executed: [],
        error: decision.error,
        started_at: startedAt,
        finished_at: finishedAt,
      });
      if (!inserted) return idempotent(input.plan.automation_id);
      return {
        automation_id: input.plan.automation_id,
        status: "failed",
        executed: [],
        error: decision.error,
      };
    }
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

function isThreadReplyAutoReply(action: AutomationAction): boolean {
  return action.type === "post_message" && action.target === "thread_reply";
}

function slackThreadTs(signal: Signal): string | null {
  const payload = signal.payload as Record<string, unknown> | null;
  if (!payload) return null;
  const threadTs = payload.thread_ts;
  if (typeof threadTs === "string" && threadTs.length > 0) return threadTs;
  const ts = payload.ts;
  if (typeof ts === "string" && ts.length > 0) return ts;
  return null;
}

function idempotent(automationId: string): ExecuteResult {
  return {
    automation_id: automationId,
    status: "skipped_idempotent",
    executed: [],
    error: null,
  };
}
