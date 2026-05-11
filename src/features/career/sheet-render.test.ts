import { describe, expect, it } from "vitest";
import {
  renderSheet,
  type SheetLevelTree,
} from "#/features/career/sheet-render";
import type {
  ScaleLegend,
  StoredCompetency,
  StoredCriterion,
  StoredEvidence,
  StoredIndicator,
  StoredLevel,
} from "#/features/career/store";

function comp(overrides: Partial<StoredCompetency> = {}): StoredCompetency {
  return {
    id: "c1",
    level_id: "lvl1",
    name: "Engineering",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function crit(overrides: Partial<StoredCriterion> = {}): StoredCriterion {
  return {
    id: "cr1",
    competency_id: "c1",
    name: "Code quality",
    target: 3,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function ind(overrides: Partial<StoredIndicator> = {}): StoredIndicator {
  return {
    id: "i1",
    criterion_id: "cr1",
    code: "1",
    description: "writes tests",
    notes: null,
    score: 2,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function ev(overrides: Partial<StoredEvidence> = {}): StoredEvidence {
  return {
    id: "e1",
    indicator_id: "i1",
    title: "PR #42",
    url: "https://example.com/pr/42",
    note: null,
    card_id: null,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function level(overrides: Partial<StoredLevel> = {}): StoredLevel {
  return {
    id: "lvl1",
    title: "L4",
    status: "active",
    header: [],
    sheet_id: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

const LEGEND: ScaleLegend = {
  label_1: "Beginner",
  label_2: "Developing",
  label_3: "Proficient",
  label_4: "Expert",
};

describe("renderSheet", () => {
  it("snapshots a small one-competency tree", () => {
    const tree: SheetLevelTree = {
      competencies: [
        {
          competency: comp(),
          criteria: [
            {
              criterion: crit(),
              indicators: [
                {
                  indicator: ind({ id: "i1", code: "1", score: 2 }),
                  evidence: [],
                },
                {
                  indicator: ind({
                    id: "i2",
                    code: "2",
                    description: "reviews code",
                    score: 3,
                  }),
                  evidence: [],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      renderSheet({ level: level(), tree, legend: LEGEND }),
    ).toMatchSnapshot();
  });

  it("resets criterion lettering A/B/C per competency", () => {
    const tree: SheetLevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1", name: "Engineering" }),
          criteria: [
            {
              criterion: crit({
                id: "cr1a",
                competency_id: "c1",
                name: "Quality",
              }),
              indicators: [],
            },
            {
              criterion: crit({
                id: "cr1b",
                competency_id: "c1",
                name: "Velocity",
              }),
              indicators: [],
            },
          ],
        },
        {
          competency: comp({ id: "c2", name: "Leadership" }),
          criteria: [
            {
              criterion: crit({
                id: "cr2a",
                competency_id: "c2",
                name: "Mentoring",
              }),
              indicators: [],
            },
            {
              criterion: crit({
                id: "cr2b",
                competency_id: "c2",
                name: "Direction",
              }),
              indicators: [],
            },
          ],
        },
      ],
    };
    const out = renderSheet({ level: level(), tree, legend: LEGEND });
    const labels = out.reportBatchUpdate.requests
      .flatMap((r) => ("updateCells" in r ? r.updateCells.rows : []))
      .map((row) => row.values[0]?.userEnteredValue.stringValue ?? "");
    // Two "A. …" rows and two "B. …" rows — one of each per competency.
    expect(labels.filter((s) => s.startsWith("A. "))).toHaveLength(2);
    expect(labels.filter((s) => s.startsWith("B. "))).toHaveLength(2);
    expect(labels).toContain("A. Quality");
    expect(labels).toContain("A. Mentoring");
    expect(labels).toContain("B. Velocity");
    expect(labels).toContain("B. Direction");
  });

  it("renders evidence with hyperlink runs only on entries that have a URL", () => {
    const tree: SheetLevelTree = {
      competencies: [
        {
          competency: comp(),
          criteria: [
            {
              criterion: crit(),
              indicators: [
                {
                  indicator: ind(),
                  evidence: [
                    ev({
                      id: "e1",
                      title: "PR #42",
                      url: "https://example.com/42",
                    }),
                    ev({ id: "e2", title: "Doc", url: null }),
                    ev({
                      id: "e3",
                      title: "Demo",
                      url: "https://example.com/demo",
                    }),
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = renderSheet({ level: level(), tree, legend: LEGEND });
    const updateCells = out.reportBatchUpdate.requests.find(
      (r): r is Extract<typeof r, { updateCells: unknown }> =>
        "updateCells" in r,
    );
    if (!updateCells) throw new Error("no updateCells");
    // Find the indicator row (the one with a number in column C).
    const indicatorRow = updateCells.updateCells.rows.find(
      (row) => row.values[2]?.userEnteredValue.numberValue !== undefined,
    );
    if (!indicatorRow) throw new Error("no indicator row");
    const evidenceCell = indicatorRow.values[3];
    expect(evidenceCell?.userEnteredValue.stringValue).toBe(
      "PR #42, Doc, Demo",
    );
    // Run map: "PR #42" link, reset before ", ", reset before ", Demo", Demo link.
    // Offsets index into "PR #42, Doc, Demo".
    expect(evidenceCell?.textFormatRuns).toEqual([
      { startIndex: 0, format: { link: { uri: "https://example.com/42" } } },
      { startIndex: 6, format: {} },
      { startIndex: 11, format: {} },
      { startIndex: 13, format: { link: { uri: "https://example.com/demo" } } },
    ]);
  });

  it("snapshots an empty header (no header rows between top bar and legend)", () => {
    const tree: SheetLevelTree = { competencies: [] };
    expect(
      renderSheet({ level: level({ header: [] }), tree, legend: LEGEND }),
    ).toMatchSnapshot();
  });

  it("snapshots a large header (multiple KV rows)", () => {
    const tree: SheetLevelTree = { competencies: [] };
    const header = [
      { key: "Role", value: "Senior Engineer" },
      { key: "Employer", value: "Acme" },
      { key: "Date", value: "2026-05-10" },
      { key: "Manager", value: "Alex" },
    ];
    expect(
      renderSheet({ level: level({ header }), tree, legend: LEGEND }),
    ).toMatchSnapshot();
  });

  it("emits a RADAR chart spec covering competency rows", () => {
    const tree: SheetLevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1", name: "Engineering" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", competency_id: "c1", target: 4 }),
              indicators: [
                {
                  indicator: ind({ id: "i1", criterion_id: "cr1", score: 2 }),
                  evidence: [],
                },
              ],
            },
          ],
        },
        {
          competency: comp({ id: "c2", name: "Leadership" }),
          criteria: [
            {
              criterion: crit({ id: "cr2", competency_id: "c2", target: 3 }),
              indicators: [
                {
                  indicator: ind({ id: "i2", criterion_id: "cr2", score: 3 }),
                  evidence: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const out = renderSheet({ level: level(), tree, legend: LEGEND });
    expect(out.chartSpec).toMatchSnapshot();
    // Wheel tab data (header + 2 competencies = 3 rows) — chart sources should
    // span exactly that range.
    const sources =
      out.chartSpec.basicChart.domains[0]?.domain.sourceRange.sources;
    expect(sources?.[0]?.endRowIndex).toBe(3);
    expect(out.chartSpec.basicChart.series).toHaveLength(2);
    expect(out.chartSpec.basicChart.chartType).toBe("RADAR");
  });

  it("excludes soft-deleted competencies, criteria, indicators, and evidence", () => {
    const tree: SheetLevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1", name: "Live" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", competency_id: "c1" }),
              indicators: [
                {
                  indicator: ind({ id: "i1" }),
                  evidence: [
                    ev({ id: "e1", title: "live", url: null }),
                    ev({
                      id: "e2",
                      title: "gone",
                      url: null,
                      deleted_at: "2026-01-02T00:00:00Z",
                    }),
                  ],
                },
                {
                  indicator: ind({
                    id: "i2",
                    deleted_at: "2026-01-02T00:00:00Z",
                  }),
                  evidence: [],
                },
              ],
            },
            {
              criterion: crit({
                id: "cr2",
                competency_id: "c1",
                name: "DeadCriterion",
                deleted_at: "2026-01-02T00:00:00Z",
              }),
              indicators: [],
            },
          ],
        },
        {
          competency: comp({
            id: "c2",
            name: "Dead",
            deleted_at: "2026-01-02T00:00:00Z",
          }),
          criteria: [],
        },
      ],
    };
    const out = renderSheet({ level: level(), tree, legend: LEGEND });
    const stringValues = out.reportBatchUpdate.requests
      .flatMap((r) => ("updateCells" in r ? r.updateCells.rows : []))
      .flatMap((row) =>
        row.values.map((v) => v.userEnteredValue.stringValue ?? ""),
      );
    expect(stringValues).toContain("Live");
    expect(stringValues).not.toContain("Dead");
    expect(stringValues).not.toContain("DeadCriterion");
    // Evidence text on the surviving indicator should only mention "live".
    expect(stringValues.some((s) => s === "live")).toBe(true);
    expect(stringValues.some((s) => s.includes("gone"))).toBe(false);
    // Wheel tab should also skip the dead competency.
    const wheelStrings = out.wheelBatchUpdate.requests
      .flatMap((r) => ("updateCells" in r ? r.updateCells.rows : []))
      .flatMap((row) =>
        row.values.map((v) => v.userEnteredValue.stringValue ?? ""),
      );
    expect(wheelStrings).toContain("Live");
    expect(wheelStrings).not.toContain("Dead");
  });
});
