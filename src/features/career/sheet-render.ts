// Pure renderer for the "Sync to Google Sheet" feature. Turns a level + its
// tree + the user's 1–4 scale legend into Google Sheets API batchUpdate request
// bodies (Report tab + Wheel tab) plus the radar chart spec for the Wheel tab.
//
// Mirrors the existing Apps Script's render pipeline: top bar (merged), header
// KV rows, then a block per competency containing a competency header, one row
// per criterion (lettered A/B/C… resetting per competency), and one indicator
// row per indicator with evidence rendered as a comma-separated rich-text run
// where each evidence title with a URL is a hyperlink. The Wheel tab is a
// simple table of per-competency current / target averages plus a RADAR chart
// spanning that range.
//
// Pure: no Sheets API calls, no I/O. The worker (workers/auth-proxy/src/sheets)
// will execute the returned requests; the snapshot tests pin the wire shape.

import { computeSatisfaction } from "#/features/career/satisfaction";
import type {
  ScaleLegend,
  StoredCompetency,
  StoredCriterion,
  StoredEvidence,
  StoredIndicator,
  StoredLevel,
} from "#/features/career/store";

// ─── Tree shape consumed by the renderer ─────────────────────────────────────
//
// Same nested shape as features/career/satisfaction's LevelTree, extended with
// evidence under each indicator. The store layer's getLevelTree returns flat
// rows; the worker will group them into this shape before calling render.

export type SheetIndicatorNode = {
  indicator: StoredIndicator;
  evidence: StoredEvidence[];
};

export type SheetCriterionNode = {
  criterion: StoredCriterion;
  indicators: SheetIndicatorNode[];
};

export type SheetCompetencyNode = {
  competency: StoredCompetency;
  criteria: SheetCriterionNode[];
};

export type SheetLevelTree = {
  competencies: SheetCompetencyNode[];
};

// ─── Sheets API request shapes (narrow subset we emit) ───────────────────────

export type GridCoord = {
  sheetId: number;
  rowIndex: number;
  columnIndex: number;
};

export type GridRange = {
  sheetId: number;
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
};

export type TextFormatRun = {
  startIndex: number;
  format: { link?: { uri: string }; bold?: boolean };
};

export type CellData = {
  userEnteredValue: { stringValue?: string; numberValue?: number };
  userEnteredFormat?: {
    textFormat?: { bold?: boolean };
    horizontalAlignment?: "LEFT" | "CENTER" | "RIGHT";
  };
  textFormatRuns?: TextFormatRun[];
};

export type RowData = { values: CellData[] };

export type UpdateCellsRequest = {
  updateCells: {
    rows: RowData[];
    fields: string;
    start: GridCoord;
  };
};

export type MergeCellsRequest = {
  mergeCells: { range: GridRange; mergeType: "MERGE_ALL" };
};

export type AddChartRequest = {
  addChart: { chart: { spec: ChartSpec; position: ChartPosition } };
};

export type DeleteEmbeddedObjectRequest = {
  deleteEmbeddedObject: { objectId: number };
};

export type SheetsRequest =
  | UpdateCellsRequest
  | MergeCellsRequest
  | AddChartRequest
  | DeleteEmbeddedObjectRequest;

export type ChartSourceRange = { sources: GridRange[] };

export type ChartSpec = {
  title: string;
  basicChart: {
    chartType: "RADAR";
    legendPosition: "RIGHT_LEGEND";
    domains: Array<{ domain: { sourceRange: ChartSourceRange } }>;
    series: Array<{ series: { sourceRange: ChartSourceRange } }>;
    headerCount: number;
  };
};

export type ChartPosition = {
  overlayPosition: {
    anchorCell: GridCoord;
    widthPixels: number;
    heightPixels: number;
  };
};

// ─── Public API ──────────────────────────────────────────────────────────────

export type SheetRenderInput = {
  level: Pick<StoredLevel, "title" | "header">;
  tree: SheetLevelTree;
  legend: ScaleLegend;
  sheetIds?: { report?: number; wheel?: number };
};

export type SheetRenderOutput = {
  reportBatchUpdate: { requests: SheetsRequest[] };
  wheelBatchUpdate: { requests: SheetsRequest[] };
  chartSpec: ChartSpec;
};

const REPORT_COLS = 5; // code | description | score | evidence | (target on criterion rows)

export function renderSheet(input: SheetRenderInput): SheetRenderOutput {
  const reportSheetId = input.sheetIds?.report ?? 0;
  const wheelSheetId = input.sheetIds?.wheel ?? 1;

  const reportRequests: SheetsRequest[] = [];
  const reportRows: RowData[] = [];

  // Top bar — merged across all five report columns, level title.
  reportRows.push(
    row([textCell(input.level.title, { bold: true, align: "CENTER" })]),
  );
  reportRequests.push({
    mergeCells: {
      range: gridRange(reportSheetId, 0, 1, 0, REPORT_COLS),
      mergeType: "MERGE_ALL",
    },
  });

  // Header KV rows — one per entry, key bold in column A, value in column B.
  for (const kv of input.level.header) {
    reportRows.push(
      row([textCell(kv.key, { bold: true }), textCell(kv.value)]),
    );
  }

  // Legend row — labels for the 1–4 scale, helps the reader anchor scores.
  reportRows.push(
    row([
      textCell("Scale", { bold: true }),
      textCell(`1 = ${input.legend.label_1}`),
      textCell(`2 = ${input.legend.label_2}`),
      textCell(`3 = ${input.legend.label_3}`),
      textCell(`4 = ${input.legend.label_4}`),
    ]),
  );

  // Spacer.
  reportRows.push(row([]));

  // One block per competency.
  for (const compNode of input.tree.competencies) {
    if (compNode.competency.deleted_at !== null) continue;
    const liveCriteria = compNode.criteria.filter(
      (cn) => cn.criterion.deleted_at === null,
    );

    // Competency header row.
    reportRows.push(
      row([
        textCell(compNode.competency.name, { bold: true, align: "CENTER" }),
      ]),
    );
    const compHeaderRowIndex = reportRows.length - 1;
    reportRequests.push({
      mergeCells: {
        range: gridRange(
          reportSheetId,
          compHeaderRowIndex,
          compHeaderRowIndex + 1,
          0,
          REPORT_COLS,
        ),
        mergeType: "MERGE_ALL",
      },
    });

    // Criterion lettering resets per competency.
    let critIdx = 0;
    for (const critNode of liveCriteria) {
      const letter = letterFor(critIdx++);
      const liveIndicators = critNode.indicators.filter(
        (ind) => ind.indicator.deleted_at === null,
      );

      // Criterion header row.
      reportRows.push(
        row([
          textCell(`${letter}. ${critNode.criterion.name}`, { bold: true }),
          textCell(""),
          textCell(""),
          textCell(""),
          textCell(`Target ${critNode.criterion.target}`, {
            bold: true,
            align: "RIGHT",
          }),
        ]),
      );

      // Indicator rows.
      for (const indNode of liveIndicators) {
        const ev = indNode.evidence.filter((e) => e.deleted_at === null);
        reportRows.push(
          row([
            textCell(indNode.indicator.code ?? ""),
            textCell(indNode.indicator.description),
            numberCell(indNode.indicator.score, { align: "CENTER" }),
            evidenceCell(ev),
            textCell(""),
          ]),
        );
      }
    }

    // Spacer between competency blocks.
    reportRows.push(row([]));
  }

  reportRequests.unshift({
    updateCells: {
      rows: reportRows,
      fields: "userEnteredValue,userEnteredFormat,textFormatRuns",
      start: { sheetId: reportSheetId, rowIndex: 0, columnIndex: 0 },
    },
  });

  // ─── Wheel tab ─────────────────────────────────────────────────────────────
  // Strip evidence to match satisfaction's LevelTree shape (flat indicators).
  const sat = computeSatisfaction({
    competencies: input.tree.competencies.map((cn) => ({
      competency: cn.competency,
      criteria: cn.criteria.map((critNode) => ({
        criterion: critNode.criterion,
        indicators: critNode.indicators.map((indNode) => indNode.indicator),
      })),
    })),
  });
  const wheelRows: RowData[] = [];
  wheelRows.push(
    row([
      textCell("Competency", { bold: true }),
      textCell("Current", { bold: true }),
      textCell("Target", { bold: true }),
    ]),
  );

  const liveCompetencies = input.tree.competencies.filter(
    (c) => c.competency.deleted_at === null,
  );
  for (const compNode of liveCompetencies) {
    const point = sat.perCompetency.get(compNode.competency.id);
    wheelRows.push(
      row([
        textCell(compNode.competency.name),
        numberCell(point ? round2(point.current) : 1),
        numberCell(point ? round2(point.target) : 1),
      ]),
    );
  }

  const wheelRequests: SheetsRequest[] = [
    {
      updateCells: {
        rows: wheelRows,
        fields: "userEnteredValue,userEnteredFormat",
        start: { sheetId: wheelSheetId, rowIndex: 0, columnIndex: 0 },
      },
    },
  ];

  // Radar chart spec — domain = competency names (col A), two series = current
  // (col B) + target (col C). headerCount=1 so the first row is treated as
  // labels, matching the existing Apps Script wheel.
  const lastDataRow = wheelRows.length; // exclusive end
  const chartSpec: ChartSpec = {
    title: `${input.level.title} — Wheel`,
    basicChart: {
      chartType: "RADAR",
      legendPosition: "RIGHT_LEGEND",
      domains: [
        {
          domain: {
            sourceRange: {
              sources: [gridRange(wheelSheetId, 0, lastDataRow, 0, 1)],
            },
          },
        },
      ],
      series: [
        {
          series: {
            sourceRange: {
              sources: [gridRange(wheelSheetId, 0, lastDataRow, 1, 2)],
            },
          },
        },
        {
          series: {
            sourceRange: {
              sources: [gridRange(wheelSheetId, 0, lastDataRow, 2, 3)],
            },
          },
        },
      ],
      headerCount: 1,
    },
  };

  return {
    reportBatchUpdate: { requests: reportRequests },
    wheelBatchUpdate: { requests: wheelRequests },
    chartSpec,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function row(values: CellData[]): RowData {
  return { values };
}

function textCell(
  value: string,
  fmt?: { bold?: boolean; align?: "LEFT" | "CENTER" | "RIGHT" },
): CellData {
  const cell: CellData = { userEnteredValue: { stringValue: value } };
  if (fmt?.bold || fmt?.align) {
    cell.userEnteredFormat = {};
    if (fmt.bold) cell.userEnteredFormat.textFormat = { bold: true };
    if (fmt.align) cell.userEnteredFormat.horizontalAlignment = fmt.align;
  }
  return cell;
}

function numberCell(
  value: number,
  fmt?: { align?: "LEFT" | "CENTER" | "RIGHT" },
): CellData {
  const cell: CellData = { userEnteredValue: { numberValue: value } };
  if (fmt?.align) {
    cell.userEnteredFormat = { horizontalAlignment: fmt.align };
  }
  return cell;
}

// Renders evidence as "Title1, Title2, Title3". Each evidence with a non-null
// URL becomes a hyperlink via a textFormatRun starting at the offset of its
// title; an entries-without-URL keeps a plain run. A trailing run resets the
// link so the comma separator afterward isn't underlined as part of the link.
function evidenceCell(items: StoredEvidence[]): CellData {
  if (items.length === 0) {
    return { userEnteredValue: { stringValue: "" } };
  }
  let text = "";
  const runs: TextFormatRun[] = [];
  for (let i = 0; i < items.length; i++) {
    const ev = items[i];
    if (!ev) continue;
    if (i > 0) {
      // Reset formatting at the separator so the previous link doesn't bleed.
      runs.push({ startIndex: text.length, format: {} });
      text += ", ";
    }
    const start = text.length;
    if (ev.url) {
      runs.push({ startIndex: start, format: { link: { uri: ev.url } } });
    } else if (i === 0) {
      runs.push({ startIndex: start, format: {} });
    }
    text += ev.title;
  }
  const cell: CellData = { userEnteredValue: { stringValue: text } };
  if (runs.length > 0) cell.textFormatRuns = runs;
  return cell;
}

function gridRange(
  sheetId: number,
  startRowIndex: number,
  endRowIndex: number,
  startColumnIndex: number,
  endColumnIndex: number,
): GridRange {
  return {
    sheetId,
    startRowIndex,
    endRowIndex,
    startColumnIndex,
    endColumnIndex,
  };
}

// 0 -> "A", 1 -> "B", ..., 25 -> "Z", 26 -> "AA". Matches the existing sheet's
// criterion lettering convention; resets per competency at the call site.
function letterFor(i: number): string {
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
