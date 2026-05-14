// Pure derivation: filter a CareerLevel tree by a text query and optional
// score-range bounds. No React, no Supabase — safe to unit-test in isolation.

import type { CareerLevel, Competency, Criterion, Indicator } from "#/features/career/components/career-data";

export type CareerFilterParams = {
  query: string;
  minScore?: number;
  maxScore?: number;
};

function matchesQuery(q: string, ...fields: (string | undefined | null)[]): boolean {
  const lower = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(lower));
}

function filterIndicator(ind: Indicator, q: string, min?: number, max?: number): boolean {
  const scoreOk =
    (min === undefined || ind.score >= min) &&
    (max === undefined || ind.score <= max);
  if (!scoreOk) return false;
  if (!q) return true;
  return (
    matchesQuery(q, ind.code, ind.description, ind.notes) ||
    ind.evidence.some((ev) => matchesQuery(q, ev.title))
  );
}

function filterCriterion(cr: Criterion, q: string, min?: number, max?: number): Criterion | null {
  const filtered = cr.indicators.filter((ind) => filterIndicator(ind, q, min, max));
  if (filtered.length === 0 && q) {
    if (!matchesQuery(q, cr.name)) return null;
  }
  // If criterion name matches, keep all indicators (unfiltered by text only)
  if (q && matchesQuery(q, cr.name)) {
    const scoreFiltered = cr.indicators.filter((ind) => {
      const scoreOk =
        (min === undefined || ind.score >= min) &&
        (max === undefined || ind.score <= max);
      return scoreOk;
    });
    return scoreFiltered.length > 0 || !min ? { ...cr, indicators: scoreFiltered.length > 0 ? scoreFiltered : cr.indicators } : null;
  }
  if (filtered.length === 0) return null;
  return { ...cr, indicators: filtered };
}

function filterCompetency(comp: Competency, q: string, min?: number, max?: number): Competency | null {
  const filteredCriteria = comp.criteria
    .map((cr) => filterCriterion(cr, q, min, max))
    .filter((cr): cr is Criterion => cr !== null);

  if (filteredCriteria.length === 0 && q) {
    if (!matchesQuery(q, comp.name)) return null;
  }
  // If competency name matches, keep all criteria (just apply score filter)
  if (q && matchesQuery(q, comp.name)) {
    const scoreFiltered = comp.criteria.map((cr) => ({
      ...cr,
      indicators: cr.indicators.filter((ind) => {
        const scoreOk =
          (min === undefined || ind.score >= min) &&
          (max === undefined || ind.score <= max);
        return scoreOk;
      }),
    })).filter((cr) => cr.indicators.length > 0 || !min);
    return { ...comp, criteria: scoreFiltered };
  }
  if (filteredCriteria.length === 0) return null;
  return { ...comp, criteria: filteredCriteria };
}

export function filterCareerLevel(level: CareerLevel, params: CareerFilterParams): CareerLevel {
  const q = params.query.trim();
  const { minScore, maxScore } = params;

  if (!q && minScore === undefined && maxScore === undefined) return level;

  const competencies = level.competencies
    .map((comp) => filterCompetency(comp, q, minScore, maxScore))
    .filter((comp): comp is Competency => comp !== null);

  return { ...level, competencies };
}
