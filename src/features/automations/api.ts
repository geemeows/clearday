// HTTP handlers for /api/automations (GET/PUT). Pure against an injected
// store; the Worker entry plumbs Supabase. PUT replaces the entire list — the
// builder UI sends the full automation set on every save, which sidesteps the
// per-id concurrency dance for v1 (mirrors the old /api/inbox-rules contract).

import {
  type Automation,
  type AutomationAction,
  type PlannedAutomation,
  validateAutomations,
} from "#/features/automations/engine";
import {
  type AutomationRunStatus,
  type AutomationRunsStore,
  type ExecutedAction,
  executeAutomation,
} from "#/features/automations/executor";

export type AutomationsStore = {
  load: () => Promise<Automation[]>;
  save: (automations: Automation[]) => Promise<Automation[]>;
};

// Read-side projection of an `automation_runs` row, exposed via
// GET /api/automations/:id/runs. Mirrors the executor's insert shape
// minus internals (the row id is included so the UI can key list rows).
export type AutomationRunRow = {
  id: string;
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

export type AutomationRunsReader = {
  /**
   * Page through runs for one automation, newest first. `before` is the
   * `started_at` ISO of the last row from the previous page (cursor); the
   * reader returns rows strictly older than the cursor.
   */
  listForAutomation: (
    automationId: string,
    opts: { limit: number; before?: string },
  ) => Promise<AutomationRunRow[]>;
  /**
   * Failed runs across all of the caller's automations, newest first, capped
   * at `limit`. Caller (`listLatestFailures`) dedups to the most recent
   * failure per automation; the reader stays a thin DB projection.
   */
  listFailures: (limit: number) => Promise<AutomationRunRow[]>;
};

export const RUNS_PAGE_LIMIT_DEFAULT = 25;
export const RUNS_PAGE_LIMIT_MAX = 100;
export const FAILURES_PAGE_LIMIT = 100;

export type GetResult = { automations: Automation[] };

export async function getAutomations(
  store: AutomationsStore,
): Promise<GetResult> {
  const automations = await store.load();
  return { automations };
}

export type PutResult =
  | { ok: true; automations: Automation[] }
  | { ok: false; error: string };

export async function putAutomations(
  body: unknown,
  store: AutomationsStore,
): Promise<PutResult> {
  const parsed = parseBody(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const errors = validateAutomations(parsed.automations);
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  const saved = await store.save(parsed.automations);
  return { ok: true, automations: saved };
}

export type ListRunsResult =
  | { ok: true; runs: AutomationRunRow[]; next_cursor: string | null }
  | { ok: false; error: string };

export type ListRunsQuery = {
  limit?: number;
  before?: string;
};

export async function listAutomationRuns(
  automationId: string,
  reader: AutomationRunsReader,
  query: ListRunsQuery = {},
): Promise<ListRunsResult> {
  if (!automationId) return { ok: false, error: "automation id required" };
  const limit = clampLimit(query.limit);
  const before = query.before;
  if (before !== undefined && Number.isNaN(Date.parse(before))) {
    return { ok: false, error: "before must be an ISO timestamp" };
  }
  const runs = await reader.listForAutomation(automationId, { limit, before });
  // Cursor for the next page: the started_at of the last row, but only if
  // we filled the page (a partial page means there's nothing older).
  const next_cursor =
    runs.length === limit ? (runs[runs.length - 1]?.started_at ?? null) : null;
  return { ok: true, runs, next_cursor };
}

export type LatestFailuresResult =
  | { ok: true; failures: AutomationRunRow[] }
  | { ok: false; error: string };

// Latest failed run per automation, surfaced inline on the Automations list
// (issue #95). Pulls a recent window of failed rows and dedups to one per
// automation_id (the newest, since `listFailures` returns newest-first).
export async function listLatestFailures(
  reader: AutomationRunsReader,
): Promise<LatestFailuresResult> {
  const rows = await reader.listFailures(FAILURES_PAGE_LIMIT);
  const seen = new Set<string>();
  const failures: AutomationRunRow[] = [];
  for (const r of rows) {
    if (seen.has(r.automation_id)) continue;
    seen.add(r.automation_id);
    failures.push(r);
  }
  return { ok: true, failures };
}

// One-shot dry-run.
//
// Runs the executor against a synthetic plan built from the target
// automation's actions with `dryRun: true`, so side effects are suppressed
// and a `skipped_dry_run` row lands. Distinct from the persisted `dry_run`
// flag (#102 / 584690e): the API caller can test a non-flagged automation
// without flipping the flag, and `options.dryRun` wins over plan-level
// dry_run in the executor either way.
//
// Trigger event id is `dryrun:${id}:${nowIso}` so each invocation lands a
// fresh row (the unique index is on (automation_id, trigger_event_id) — same
// timestamp twice would collide, which is desirable for re-press idempotency
// at the same instant but unlikely in practice). The id factory is injectable
// for tests.
export type DryRunResult =
  | {
      ok: true;
      automation_id: string;
      status: AutomationRunStatus;
      actions_planned: AutomationAction[];
      trigger_event_id: string;
      started_at: string;
    }
  | { ok: false; error: string };

export async function dryRunAutomation(
  automationId: string,
  store: AutomationsStore,
  runs: AutomationRunsStore,
  options: { now?: () => Date } = {},
): Promise<DryRunResult> {
  if (!automationId) return { ok: false, error: "automation id required" };
  const automations = await store.load();
  const automation = automations.find((a) => a.id === automationId);
  if (!automation) return { ok: false, error: "automation not found" };

  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const triggerEventId = `dryrun:${automationId}:${startedAt}`;
  const plan: PlannedAutomation = {
    automation_id: automationId,
    actions: automation.actions,
  };
  const result = await executeAutomation(
    { plan, triggerEventId, signalId: null, signal: null },
    runs,
    { dryRun: true, now },
  );
  return {
    ok: true,
    automation_id: automationId,
    status: result.status,
    actions_planned: automation.actions,
    trigger_event_id: triggerEventId,
    started_at: startedAt,
  };
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return RUNS_PAGE_LIMIT_DEFAULT;
  if (!Number.isFinite(raw) || raw <= 0) return RUNS_PAGE_LIMIT_DEFAULT;
  const n = Math.floor(raw);
  return n > RUNS_PAGE_LIMIT_MAX ? RUNS_PAGE_LIMIT_MAX : n;
}

function parseBody(
  body: unknown,
): { ok: true; automations: Automation[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const automations = (body as { automations?: unknown }).automations;
  if (!Array.isArray(automations)) {
    return { ok: false, error: "automations must be an array" };
  }
  return { ok: true, automations: automations as Automation[] };
}
