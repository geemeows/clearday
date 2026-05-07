// HTTP handlers for /api/automations (GET/PUT). Pure against an injected
// store; the Worker entry plumbs Supabase. PUT replaces the entire list — the
// builder UI sends the full automation set on every save, which sidesteps the
// per-id concurrency dance for v1 (mirrors the old /api/inbox-rules contract).

import {
  type Automation,
  type AutomationAction,
  validateAutomations,
} from "#/features/automations/engine";
import type {
  AutomationRunStatus,
  ExecutedAction,
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
};

export const RUNS_PAGE_LIMIT_DEFAULT = 25;
export const RUNS_PAGE_LIMIT_MAX = 100;

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
