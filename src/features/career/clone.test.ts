import { describe, expect, it } from "vitest";
import {
  type ArchivedLevelTree,
  cloneArchivedLevel,
} from "#/features/career/clone";
import type {
  StoredCompetency,
  StoredCriterion,
  StoredIndicator,
} from "#/features/career/store";

function comp(overrides: Partial<StoredCompetency> = {}): StoredCompetency {
  return {
    id: "c1",
    level_id: "lvl1",
    name: "Eng",
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
    name: "Quality",
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
    code: "A",
    description: "writes tests",
    notes: null,
    score: 4,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("cloneArchivedLevel", () => {
  it("preserves structure + target values, drops evidence + header, scores omitted (createIndicator bakes score=1)", () => {
    const tree: ArchivedLevelTree = {
      title: "Old L4",
      competencies: [comp({ id: "c1", name: "Eng", position: 0 })],
      criteria: [
        crit({
          id: "cr1",
          competency_id: "c1",
          name: "Quality",
          target: 3,
          position: 1024,
        }),
      ],
      indicators: [
        ind({
          id: "i1",
          criterion_id: "cr1",
          code: "A",
          description: "writes tests",
          notes: "with coverage",
          score: 4,
          position: 2048,
        }),
      ],
    };

    const seed = cloneArchivedLevel(tree, "New L4");

    expect(seed).toEqual({
      title: "New L4",
      competencies: [
        {
          name: "Eng",
          position: 0,
          criteria: [
            {
              name: "Quality",
              target: 3,
              position: 1024,
              indicators: [
                {
                  description: "writes tests",
                  code: "A",
                  notes: "with coverage",
                  position: 2048,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("groups deep tree by parent id and preserves positions", () => {
    const tree: ArchivedLevelTree = {
      title: "Old",
      competencies: [
        comp({ id: "c1", name: "Eng", position: 0 }),
        comp({ id: "c2", name: "Collab", position: 1024 }),
      ],
      criteria: [
        crit({
          id: "cr1",
          competency_id: "c1",
          name: "Quality",
          target: 3,
          position: 0,
        }),
        crit({
          id: "cr2",
          competency_id: "c2",
          name: "Mentoring",
          target: 2,
          position: 0,
        }),
      ],
      indicators: [
        ind({
          id: "i1",
          criterion_id: "cr1",
          code: "A",
          description: "tests",
          score: 2,
          position: 0,
        }),
        ind({
          id: "i2",
          criterion_id: "cr2",
          code: "A",
          description: "pairs",
          score: 3,
          position: 0,
        }),
      ],
    };

    const seed = cloneArchivedLevel(tree, "Cloned");
    expect(seed.competencies.map((c) => c.name)).toEqual(["Eng", "Collab"]);
    expect(seed.competencies[0]?.criteria.map((c) => c.name)).toEqual([
      "Quality",
    ]);
    expect(seed.competencies[1]?.criteria[0]?.indicators[0]?.description).toBe(
      "pairs",
    );
  });

  it("excludes soft-deleted competencies / criteria / indicators", () => {
    const tree: ArchivedLevelTree = {
      title: "Old",
      competencies: [
        comp({ id: "c1", name: "Eng" }),
        comp({ id: "c2", name: "Gone", deleted_at: "2026-04-01T00:00:00Z" }),
      ],
      criteria: [
        crit({ id: "cr1", competency_id: "c1", name: "Quality" }),
        crit({
          id: "cr2",
          competency_id: "c1",
          name: "Dropped",
          deleted_at: "2026-04-01T00:00:00Z",
        }),
      ],
      indicators: [
        ind({ id: "i1", criterion_id: "cr1", description: "kept" }),
        ind({
          id: "i2",
          criterion_id: "cr1",
          description: "purged",
          deleted_at: "2026-04-01T00:00:00Z",
        }),
      ],
    };

    const seed = cloneArchivedLevel(tree, "Cloned");
    expect(seed.competencies.map((c) => c.name)).toEqual(["Eng"]);
    expect(seed.competencies[0]?.criteria.map((c) => c.name)).toEqual([
      "Quality",
    ]);
    expect(
      seed.competencies[0]?.criteria[0]?.indicators.map((i) => i.description),
    ).toEqual(["kept"]);
  });

  it("does not carry header KVs (output shape has no header field)", () => {
    const tree: ArchivedLevelTree = {
      title: "Old",
      competencies: [],
      criteria: [],
      indicators: [],
    };
    const seed = cloneArchivedLevel(tree, "Cloned");
    expect(seed).not.toHaveProperty("header");
  });

  it("returns an empty competencies array when the tree is empty", () => {
    const tree: ArchivedLevelTree = {
      title: "Old",
      competencies: [],
      criteria: [],
      indicators: [],
    };
    expect(cloneArchivedLevel(tree, "Cloned")).toEqual({
      title: "Cloned",
      competencies: [],
    });
  });

  it("output has no score field on indicators (createIndicator defaults score=1)", () => {
    const tree: ArchivedLevelTree = {
      title: "Old",
      competencies: [comp()],
      criteria: [crit()],
      indicators: [ind({ score: 4 })],
    };
    const seed = cloneArchivedLevel(tree, "Cloned");
    const indicator = seed.competencies[0]?.criteria[0]?.indicators[0];
    expect(indicator).not.toHaveProperty("score");
  });
});
