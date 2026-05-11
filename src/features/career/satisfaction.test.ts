import { describe, expect, it } from "vitest";
import {
  computeSatisfaction,
  type LevelTree,
} from "#/features/career/satisfaction";
import type {
  StoredCompetency,
  StoredCriterion,
  StoredIndicator,
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
    code: null,
    description: "writes tests",
    notes: null,
    score: 1,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("computeSatisfaction", () => {
  it("averages indicator scores per criterion and per competency", () => {
    const tree: LevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", competency_id: "c1", target: 3 }),
              indicators: [
                ind({ id: "i1", score: 2 }),
                ind({ id: "i2", score: 4 }),
              ],
            },
            {
              criterion: crit({ id: "cr2", competency_id: "c1", target: 4 }),
              indicators: [ind({ id: "i3", score: 3 })],
            },
          ],
        },
      ],
    };
    const { perCriterion, perCompetency } = computeSatisfaction(tree);
    expect(perCriterion.get("cr1")).toEqual({ current: 3, target: 3 });
    expect(perCriterion.get("cr2")).toEqual({ current: 3, target: 4 });
    expect(perCompetency.get("c1")).toEqual({ current: 3, target: 3.5 });
  });

  it("returns current=1 (the floor) for criteria with no indicators", () => {
    const tree: LevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", target: 4 }),
              indicators: [],
            },
          ],
        },
      ],
    };
    const { perCriterion, perCompetency } = computeSatisfaction(tree);
    expect(perCriterion.get("cr1")).toEqual({ current: 1, target: 4 });
    expect(perCompetency.get("c1")).toEqual({ current: 1, target: 4 });
  });

  it("falls back to {1,1} for empty competencies", () => {
    const tree: LevelTree = {
      competencies: [{ competency: comp({ id: "c1" }), criteria: [] }],
    };
    const { perCompetency, perCriterion } = computeSatisfaction(tree);
    expect(perCompetency.get("c1")).toEqual({ current: 1, target: 1 });
    expect(perCriterion.size).toBe(0);
  });

  it("yields all-ones when every indicator is at the floor", () => {
    const tree: LevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", target: 4 }),
              indicators: [
                ind({ id: "i1", score: 1 }),
                ind({ id: "i2", score: 1 }),
              ],
            },
          ],
        },
      ],
    };
    const { perCriterion, perCompetency } = computeSatisfaction(tree);
    expect(perCriterion.get("cr1")).toEqual({ current: 1, target: 4 });
    expect(perCompetency.get("c1")).toEqual({ current: 1, target: 4 });
  });

  it("yields all-target when every indicator matches the target ceiling", () => {
    const tree: LevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1" }),
          criteria: [
            {
              criterion: crit({ id: "cr1", target: 4 }),
              indicators: [
                ind({ id: "i1", score: 4 }),
                ind({ id: "i2", score: 4 }),
              ],
            },
          ],
        },
      ],
    };
    const { perCriterion, perCompetency } = computeSatisfaction(tree);
    expect(perCriterion.get("cr1")).toEqual({ current: 4, target: 4 });
    expect(perCompetency.get("c1")).toEqual({ current: 4, target: 4 });
  });

  it("excludes soft-deleted competencies, criteria, and indicators", () => {
    const tree: LevelTree = {
      competencies: [
        {
          competency: comp({ id: "c1", deleted_at: "2026-02-01" }),
          criteria: [
            {
              criterion: crit({ id: "cr-x", competency_id: "c1", target: 4 }),
              indicators: [ind({ score: 4 })],
            },
          ],
        },
        {
          competency: comp({ id: "c2" }),
          criteria: [
            {
              criterion: crit({
                id: "cr-dead",
                competency_id: "c2",
                target: 4,
                deleted_at: "2026-02-01",
              }),
              indicators: [ind({ score: 4 })],
            },
            {
              criterion: crit({ id: "cr2", competency_id: "c2", target: 3 }),
              indicators: [
                ind({ id: "ia", score: 4 }),
                ind({
                  id: "ib",
                  score: 1,
                  deleted_at: "2026-02-01",
                }),
              ],
            },
          ],
        },
      ],
    };
    const { perCriterion, perCompetency } = computeSatisfaction(tree);
    expect(perCompetency.has("c1")).toBe(false);
    expect(perCriterion.has("cr-x")).toBe(false);
    expect(perCriterion.has("cr-dead")).toBe(false);
    // Only ia (score=4) counts; ib was soft-deleted.
    expect(perCriterion.get("cr2")).toEqual({ current: 4, target: 3 });
    expect(perCompetency.get("c2")).toEqual({ current: 4, target: 3 });
  });
});
