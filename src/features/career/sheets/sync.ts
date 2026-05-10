// Career → Google Sheet sync orchestrator. Pure-ish module wired by the
// worker route at POST /api/career/sync. The route loads a level + tree from
// Supabase, runs the sheet-render pipeline, and applies the result to the
// user's Sheets file via the client in ./client.ts.
//
// First sync: createSpreadsheet (auto-named after the level title) → persist
// the new spreadsheetId to career_levels.sheet_id. Subsequent syncs: read the
// existing spreadsheet's metadata to find sheet ids + any embedded charts on
// the Wheel tab, clear Report + Wheel, apply the rendered batchUpdates,
// delete-then-re-add the radar chart (Sheets has no chart upsert — without
// the explicit delete a re-sync would stack duplicates), then bump
// last_synced_at and return the spreadsheet URL.

import {
  renderSheet,
  type SheetCompetencyNode,
  type SheetCriterionNode,
  type SheetIndicatorNode,
  type SheetLevelTree,
} from "#/features/career/sheet-render";
import {
  addChart,
  batchUpdate,
  clearTab,
  createSpreadsheet,
  getSpreadsheetMetadata,
  SheetsApiError,
  type SheetsClientDeps,
  type SheetsFetch,
} from "#/features/career/sheets/client";
import {
  getLevelTree,
  getScaleLegend,
  type StoredEvidence,
  type StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

export type SyncResult =
  | {
      ok: true;
      spreadsheetId: string;
      spreadsheetUrl: string;
      last_synced_at: string;
    }
  | {
      ok: false;
      error: string;
      reason: "no_token" | "level_not_found" | "sheets_api_error" | "db_error";
      needs_reauth?: boolean;
    };

export type SyncDeps = {
  client: SupabaseLike;
  token: string | null;
  fetch: SheetsFetch;
  now?: () => Date;
};

export async function syncCareerLevelToSheet(
  levelId: string,
  deps: SyncDeps,
): Promise<SyncResult> {
  if (!deps.token) {
    return {
      ok: false,
      error: "google not connected",
      reason: "no_token",
      needs_reauth: true,
    };
  }
  const sheetsDeps: SheetsClientDeps = {
    token: deps.token,
    fetch: deps.fetch,
  };

  // 1. Load the level row + tree + evidence + legend in parallel.
  let level: StoredLevel | null;
  let tree: Awaited<ReturnType<typeof getLevelTree>>;
  let legend: Awaited<ReturnType<typeof getScaleLegend>>;
  try {
    [level, tree, legend] = await Promise.all([
      loadLevel(deps.client, levelId),
      getLevelTree(deps.client, levelId),
      getScaleLegend(deps.client),
    ]);
  } catch (err) {
    return { ok: false, error: errMessage(err), reason: "db_error" };
  }
  if (!level) {
    return { ok: false, error: "level not found", reason: "level_not_found" };
  }

  // 2. Batch-load evidence for all indicators in this level (one IN-query).
  const indicatorIds = tree.indicators.map((i) => i.id);
  let evidenceByIndicator: Map<string, StoredEvidence[]>;
  try {
    evidenceByIndicator = await loadEvidenceForIndicators(
      deps.client,
      indicatorIds,
    );
  } catch (err) {
    return { ok: false, error: errMessage(err), reason: "db_error" };
  }

  const sheetTree = buildSheetTree(tree, evidenceByIndicator);

  // 3. Ensure the spreadsheet exists. Capture the actual sheet ids assigned
  //    by Google so renderSheet's GridRange refs line up with the real tabs.
  let spreadsheetId: string;
  let spreadsheetUrl: string;
  let reportSheetId: number;
  let wheelSheetId: number;
  let chartIdsToDelete: number[] = [];
  let isFirstSync = false;
  try {
    if (!level.sheet_id) {
      const created = await createSpreadsheet(level.title, sheetsDeps);
      spreadsheetId = created.spreadsheetId;
      spreadsheetUrl = created.spreadsheetUrl;
      reportSheetId = created.reportSheetId;
      wheelSheetId = created.wheelSheetId;
      isFirstSync = true;
    } else {
      spreadsheetId = level.sheet_id;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
      const meta = await getSpreadsheetMetadata(spreadsheetId, sheetsDeps);
      reportSheetId = meta.reportSheetId;
      wheelSheetId = meta.wheelSheetId;
      chartIdsToDelete = meta.wheelChartIds;
    }
  } catch (err) {
    return sheetsErrorResult(err);
  }

  // 4. Render the batch update bodies pinned to the real sheet ids.
  const rendered = renderSheet({
    level: { title: level.title, header: level.header },
    tree: sheetTree,
    legend,
    sheetIds: { report: reportSheetId, wheel: wheelSheetId },
  });

  // 5. Persist sheet_id immediately on first sync — if any subsequent step
  //    fails we don't want to orphan a spreadsheet on the next attempt.
  if (isFirstSync) {
    try {
      await persistSheetId(deps.client, levelId, spreadsheetId);
    } catch (err) {
      return { ok: false, error: errMessage(err), reason: "db_error" };
    }
  }

  // 6. Clear Report + Wheel, delete any pre-existing charts, apply
  //    renderSheet's requests, then add the radar chart.
  try {
    await clearTab(spreadsheetId, "Report", sheetsDeps);
    await clearTab(spreadsheetId, "Wheel", sheetsDeps);
    if (chartIdsToDelete.length > 0) {
      await batchUpdate(
        spreadsheetId,
        chartIdsToDelete.map((objectId) => ({
          deleteEmbeddedObject: { objectId },
        })),
        sheetsDeps,
      );
    }
    await batchUpdate(
      spreadsheetId,
      rendered.reportBatchUpdate.requests,
      sheetsDeps,
    );
    await batchUpdate(
      spreadsheetId,
      rendered.wheelBatchUpdate.requests,
      sheetsDeps,
    );
    await addChart(
      { spreadsheetId, wheelSheetId, chartSpec: rendered.chartSpec },
      sheetsDeps,
    );
  } catch (err) {
    return sheetsErrorResult(err);
  }

  // 7. Bump last_synced_at.
  const now = (deps.now ?? (() => new Date()))().toISOString();
  try {
    await persistLastSynced(deps.client, levelId, now);
  } catch (err) {
    return { ok: false, error: errMessage(err), reason: "db_error" };
  }

  return {
    ok: true,
    spreadsheetId,
    spreadsheetUrl,
    last_synced_at: now,
  };
}

// ─── Unlink ──────────────────────────────────────────────────────────────────
//
// Nulls sheet_id + last_synced_at. The user can re-sync later to provision a
// fresh spreadsheet. We do *not* delete the underlying Google Sheet — the user
// can keep / archive / share it independently.

export async function unlinkCareerSheet(
  levelId: string,
  client: SupabaseLike,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client
    .from("career_levels")
    .update({ sheet_id: null, last_synced_at: null })
    .eq("id", levelId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadLevel(
  client: SupabaseLike,
  levelId: string,
): Promise<StoredLevel | null> {
  const { data, error } = await client
    .from("career_levels")
    .select("*")
    .eq("id", levelId)
    .limit(1);
  if (error) throw new Error(`career level fetch failed: ${error.message}`);
  const rows = (data ?? []) as StoredLevel[];
  return rows[0] ?? null;
}

async function loadEvidenceForIndicators(
  client: SupabaseLike,
  indicatorIds: string[],
): Promise<Map<string, StoredEvidence[]>> {
  const out = new Map<string, StoredEvidence[]>();
  if (indicatorIds.length === 0) return out;
  const { data, error } = await client
    .from("career_evidence")
    .select("*")
    .in("indicator_id", indicatorIds)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(5000);
  if (error) throw new Error(`career evidence fetch failed: ${error.message}`);
  for (const e of (data ?? []) as StoredEvidence[]) {
    const list = out.get(e.indicator_id) ?? [];
    list.push(e);
    out.set(e.indicator_id, list);
  }
  return out;
}

async function persistSheetId(
  client: SupabaseLike,
  levelId: string,
  sheetId: string,
): Promise<void> {
  const { error } = await client
    .from("career_levels")
    .update({ sheet_id: sheetId })
    .eq("id", levelId);
  if (error) throw new Error(`persist sheet_id failed: ${error.message}`);
}

async function persistLastSynced(
  client: SupabaseLike,
  levelId: string,
  iso: string,
): Promise<void> {
  const { error } = await client
    .from("career_levels")
    .update({ last_synced_at: iso })
    .eq("id", levelId);
  if (error) throw new Error(`persist last_synced_at failed: ${error.message}`);
}

function buildSheetTree(
  tree: Awaited<ReturnType<typeof getLevelTree>>,
  evidenceByIndicator: Map<string, StoredEvidence[]>,
): SheetLevelTree {
  const indicatorsByCriterion = new Map<string, typeof tree.indicators>();
  for (const ind of tree.indicators) {
    const list = indicatorsByCriterion.get(ind.criterion_id) ?? [];
    list.push(ind);
    indicatorsByCriterion.set(ind.criterion_id, list);
  }
  const criteriaByCompetency = new Map<string, typeof tree.criteria>();
  for (const crit of tree.criteria) {
    const list = criteriaByCompetency.get(crit.competency_id) ?? [];
    list.push(crit);
    criteriaByCompetency.set(crit.competency_id, list);
  }
  const competencies: SheetCompetencyNode[] = tree.competencies.map(
    (competency) => {
      const criteria: SheetCriterionNode[] = (
        criteriaByCompetency.get(competency.id) ?? []
      ).map((criterion) => {
        const indicators: SheetIndicatorNode[] = (
          indicatorsByCriterion.get(criterion.id) ?? []
        ).map((indicator) => ({
          indicator,
          evidence: evidenceByIndicator.get(indicator.id) ?? [],
        }));
        return { criterion, indicators };
      });
      return { competency, criteria };
    },
  );
  return { competencies };
}

function sheetsErrorResult(err: unknown): SyncResult {
  if (err instanceof SheetsApiError) {
    return {
      ok: false,
      error: err.message,
      reason: "sheets_api_error",
      needs_reauth: err.status === 401 || err.status === 403,
    };
  }
  return { ok: false, error: errMessage(err), reason: "sheets_api_error" };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
