import { describe, expect, it } from "vitest";
import { SAMPLE_TEMPLATE } from "#/features/career/sample-template";

describe("SAMPLE_TEMPLATE", () => {
  it("has the documented shape: 1 level / 2 competencies / 4 criteria / 6 indicators", () => {
    expect(SAMPLE_TEMPLATE.title).toBe("Sample");
    expect(SAMPLE_TEMPLATE.competencies).toHaveLength(2);
    const criteria = SAMPLE_TEMPLATE.competencies.flatMap((c) => c.criteria);
    expect(criteria).toHaveLength(4);
    const indicators = criteria.flatMap((c) => c.indicators);
    expect(indicators).toHaveLength(6);
  });

  it("uses targets in the 1–4 range — no zeros", () => {
    for (const c of SAMPLE_TEMPLATE.competencies) {
      for (const cr of c.criteria) {
        expect(cr.target).toBeGreaterThanOrEqual(1);
        expect(cr.target).toBeLessThanOrEqual(4);
      }
    }
  });

  it("ships zero evidence — the user adds their own", () => {
    // Evidence is intentionally absent from the seed shape; this test pins
    // that contract so a future re-shape doesn't silently bake evidence in.
    const indicators = SAMPLE_TEMPLATE.competencies
      .flatMap((c) => c.criteria)
      .flatMap((cr) => cr.indicators);
    for (const ind of indicators) {
      expect(ind).not.toHaveProperty("evidence");
    }
  });
});
