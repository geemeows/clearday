// Pure source of truth for the Career wheel / radar view.
//
// Given a level tree (competencies → criteria → indicators), returns per-
// criterion and per-competency {current, target} pairs. The 1–4 scale (post-
// migration 0029) defines a floor of 1: criteria with no indicators yield
// current = 1, and empty competencies fall back to current = 1, target = 1.

import type {
  StoredCompetency,
  StoredCriterion,
  StoredIndicator,
} from "#/features/career/store";

export type CriterionNode = {
  criterion: StoredCriterion;
  indicators: StoredIndicator[];
};

export type CompetencyNode = {
  competency: StoredCompetency;
  criteria: CriterionNode[];
};

export type LevelTree = {
  competencies: CompetencyNode[];
};

export type SatisfactionPoint = { current: number; target: number };

export type Satisfaction = {
  perCriterion: Map<string, SatisfactionPoint>;
  perCompetency: Map<string, SatisfactionPoint>;
};

const FLOOR = 1;

function avg(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

export function computeSatisfaction(tree: LevelTree): Satisfaction {
  const perCriterion = new Map<string, SatisfactionPoint>();
  const perCompetency = new Map<string, SatisfactionPoint>();

  for (const compNode of tree.competencies) {
    if (compNode.competency.deleted_at !== null) continue;

    const liveCriteria = compNode.criteria.filter(
      (cn) => cn.criterion.deleted_at === null,
    );

    const criterionPoints: SatisfactionPoint[] = [];
    for (const critNode of liveCriteria) {
      const liveIndicators = critNode.indicators.filter(
        (ind) => ind.deleted_at === null,
      );
      const current = avg(
        liveIndicators.map((i) => i.score),
        FLOOR,
      );
      const target = critNode.criterion.target;
      const point: SatisfactionPoint = { current, target };
      perCriterion.set(critNode.criterion.id, point);
      criterionPoints.push(point);
    }

    const compCurrent = avg(
      criterionPoints.map((p) => p.current),
      FLOOR,
    );
    const compTarget = avg(
      criterionPoints.map((p) => p.target),
      FLOOR,
    );
    perCompetency.set(compNode.competency.id, {
      current: compCurrent,
      target: compTarget,
    });
  }

  return { perCriterion, perCompetency };
}
