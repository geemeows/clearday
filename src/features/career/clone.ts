// "Clone as starting template" — pure transform that turns an archived level's
// tree into a seed for a new active level. Preserves the structure (competencies
// / criteria / indicators) and `target` values, resets `score` to the 1–4 floor,
// drops evidence, drops the per-level header, and excludes soft-deleted rows.
// Positions are preserved so the new tree visually matches the source.
//
// Mirrors features/career/sample-template.ts shape extended with positions —
// the store layer (cloneArchivedLevelAsActive) walks this seed and writes rows
// via the existing createLevel / createCompetency / createCriterion /
// createIndicator fns, which already bake `score=1` and `status="active"` in.

import type {
  StoredCompetency,
  StoredCriterion,
  StoredIndicator,
} from "#/features/career/store";

export type ClonedIndicator = {
  description: string;
  code: string | null;
  notes: string | null;
  position: number;
};

export type ClonedCriterion = {
  name: string;
  target: number;
  position: number;
  indicators: ClonedIndicator[];
};

export type ClonedCompetency = {
  name: string;
  position: number;
  criteria: ClonedCriterion[];
};

export type ClonedLevelSeed = {
  title: string;
  competencies: ClonedCompetency[];
};

export type ArchivedLevelTree = {
  title: string;
  competencies: StoredCompetency[];
  criteria: StoredCriterion[];
  indicators: StoredIndicator[];
};

const isLive = (row: { deleted_at: string | null }) => row.deleted_at === null;

export function cloneArchivedLevel(
  tree: ArchivedLevelTree,
  newTitle: string,
): ClonedLevelSeed {
  const liveCompetencies = tree.competencies.filter(isLive);
  const liveCriteria = tree.criteria.filter(isLive);
  const liveIndicators = tree.indicators.filter(isLive);

  const competencies: ClonedCompetency[] = liveCompetencies.map((comp) => {
    const criteria: ClonedCriterion[] = liveCriteria
      .filter((cr) => cr.competency_id === comp.id)
      .map((cr) => {
        const indicators: ClonedIndicator[] = liveIndicators
          .filter((ind) => ind.criterion_id === cr.id)
          .map((ind) => ({
            description: ind.description,
            code: ind.code,
            notes: ind.notes,
            position: ind.position,
          }));
        return {
          name: cr.name,
          target: cr.target,
          position: cr.position,
          indicators,
        };
      });
    return {
      name: comp.name,
      position: comp.position,
      criteria,
    };
  });

  return { title: newTitle, competencies };
}
