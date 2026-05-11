// Thin Google Sheets API client for the Career → Google Sheet sync. Pure
// module with injected fetch + access token; no SDKs. The worker route loads
// the user's Google access token from provider_accounts and calls these.
//
// Surface mirrors the four operations sheet-render.ts and the sync route need:
// createSpreadsheet (first-time provisioning), clearTab (wipe Report/Wheel
// before rewriting), batchUpdate (apply renderSheet output), and a small
// metadata.get helper used to find an existing chart on the Wheel tab so we
// can delete it before re-adding (defensive chart handling — Google Sheets has
// no upsert for embedded charts; a re-sync would otherwise stack duplicates).

import type { ChartSpec, SheetsRequest } from "#/features/career/sheet-render";

export type SheetsFetch = typeof fetch;

export type SheetsClientDeps = {
  token: string;
  fetch: SheetsFetch;
};

export type SheetsClientError = {
  status: number;
  body: string;
};

export class SheetsApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`sheets HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "SheetsApiError";
    this.status = status;
    this.body = body;
  }
}

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// ─── createSpreadsheet ───────────────────────────────────────────────────────

export type CreateSpreadsheetResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  // Sheet ids assigned by Google for the two named tabs we asked for. The
  // sync route passes these into renderSheet so the emitted GridRange refs
  // line up with the actual tab ids (default 0/1 are not guaranteed).
  reportSheetId: number;
  wheelSheetId: number;
};

export async function createSpreadsheet(
  title: string,
  deps: SheetsClientDeps,
): Promise<CreateSpreadsheetResult> {
  const res = await deps.fetch(BASE, {
    method: "POST",
    headers: authHeaders(deps.token, true),
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "Report" } },
        { properties: { title: "Wheel" } },
      ],
    }),
  });
  if (!res.ok) {
    throw new SheetsApiError(res.status, await safeText(res));
  }
  const body = (await res.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
  if (!body.spreadsheetId || !body.spreadsheetUrl || !body.sheets) {
    throw new SheetsApiError(
      res.status,
      "createSpreadsheet response missing required fields",
    );
  }
  const report = body.sheets.find((s) => s.properties?.title === "Report")
    ?.properties?.sheetId;
  const wheel = body.sheets.find((s) => s.properties?.title === "Wheel")
    ?.properties?.sheetId;
  if (typeof report !== "number" || typeof wheel !== "number") {
    throw new SheetsApiError(
      res.status,
      "createSpreadsheet response missing Report/Wheel sheetId",
    );
  }
  return {
    spreadsheetId: body.spreadsheetId,
    spreadsheetUrl: body.spreadsheetUrl,
    reportSheetId: report,
    wheelSheetId: wheel,
  };
}

// ─── getSpreadsheet (metadata) ───────────────────────────────────────────────
//
// Returns the minimal metadata the sync route needs: sheet ids for the two
// named tabs and the list of embedded chart object ids on the Wheel tab so
// the route can delete-then-re-add cleanly.

export type SpreadsheetMetadata = {
  reportSheetId: number;
  wheelSheetId: number;
  wheelChartIds: number[];
};

export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  deps: SheetsClientDeps,
): Promise<SpreadsheetMetadata> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title),charts(chartId))`;
  const res = await deps.fetch(url, {
    method: "GET",
    headers: authHeaders(deps.token, false),
  });
  if (!res.ok) {
    throw new SheetsApiError(res.status, await safeText(res));
  }
  const body = (await res.json()) as {
    sheets?: Array<{
      properties?: { sheetId?: number; title?: string };
      charts?: Array<{ chartId?: number }>;
    }>;
  };
  const sheets = body.sheets ?? [];
  const report = sheets.find((s) => s.properties?.title === "Report")
    ?.properties?.sheetId;
  const wheel = sheets.find((s) => s.properties?.title === "Wheel");
  const wheelId = wheel?.properties?.sheetId;
  if (typeof report !== "number" || typeof wheelId !== "number") {
    throw new SheetsApiError(
      res.status,
      "spreadsheet missing Report/Wheel tabs",
    );
  }
  const wheelChartIds = (wheel?.charts ?? [])
    .map((c) => c.chartId)
    .filter((id): id is number => typeof id === "number");
  return { reportSheetId: report, wheelSheetId: wheelId, wheelChartIds };
}

// ─── clearTab ────────────────────────────────────────────────────────────────
//
// Wipes values on a tab by name (e.g. "Report"). The sync route clears Report
// and Wheel before re-applying renderSheet's batchUpdate output so a re-sync
// is a clean rewrite rather than an overlay on stale rows.

export async function clearTab(
  spreadsheetId: string,
  tabName: string,
  deps: SheetsClientDeps,
): Promise<void> {
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(tabName)}:clear`;
  const res = await deps.fetch(url, {
    method: "POST",
    headers: authHeaders(deps.token, true),
    body: "{}",
  });
  if (!res.ok) {
    throw new SheetsApiError(res.status, await safeText(res));
  }
}

// ─── batchUpdate ─────────────────────────────────────────────────────────────

export async function batchUpdate(
  spreadsheetId: string,
  requests: SheetsRequest[],
  deps: SheetsClientDeps,
): Promise<void> {
  if (requests.length === 0) return;
  const url = `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const res = await deps.fetch(url, {
    method: "POST",
    headers: authHeaders(deps.token, true),
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    throw new SheetsApiError(res.status, await safeText(res));
  }
}

// ─── addChart ────────────────────────────────────────────────────────────────
//
// Convenience wrapper around batchUpdate for the radar chart. Position is the
// fixed Wheel-tab anchor (top-right of the data range) — the sync route just
// hands over chartSpec from renderSheet.

export type AddChartParams = {
  spreadsheetId: string;
  wheelSheetId: number;
  chartSpec: ChartSpec;
};

export async function addChart(
  params: AddChartParams,
  deps: SheetsClientDeps,
): Promise<void> {
  await batchUpdate(
    params.spreadsheetId,
    [
      {
        addChart: {
          chart: {
            spec: params.chartSpec,
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId: params.wheelSheetId,
                  rowIndex: 1,
                  columnIndex: 4,
                },
                widthPixels: 600,
                heightPixels: 400,
              },
            },
          },
        },
      },
    ],
    deps,
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeaders(token: string, withJsonBody: boolean): HeadersInit {
  const h: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
  };
  if (withJsonBody) h["content-type"] = "application/json";
  return h;
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
