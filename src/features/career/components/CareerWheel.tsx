// Radar / wheel rendering of the active level. One axis per (live) competency,
// two filled polygons: target (background) and current (foreground). Pure SVG
// — no chart library is in the repo and the shape is simple enough that
// pulling one in for one screen would be overkill.
//
// Loads the level tree via `getLevelTree`, hands it to the pure
// `computeSatisfaction` math, then plots per-competency points on a 1–4 scale.

import { useEffect, useState } from "react";
import {
  computeSatisfaction,
  type LevelTree,
} from "#/features/career/satisfaction";
import {
  getLevelTree,
  type StoredCompetency,
  type StoredCriterion,
  type StoredIndicator,
  type StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

const SCALE_MIN = 1;
const SCALE_MAX = 4;

// Group flat rows into the nested LevelTree the satisfaction math expects.
function buildTree(
  competencies: StoredCompetency[],
  criteria: StoredCriterion[],
  indicators: StoredIndicator[],
): LevelTree {
  const indicatorsByCrit = new Map<string, StoredIndicator[]>();
  for (const ind of indicators) {
    const list = indicatorsByCrit.get(ind.criterion_id) ?? [];
    list.push(ind);
    indicatorsByCrit.set(ind.criterion_id, list);
  }
  const critsByComp = new Map<string, StoredCriterion[]>();
  for (const cr of criteria) {
    const list = critsByComp.get(cr.competency_id) ?? [];
    list.push(cr);
    critsByComp.set(cr.competency_id, list);
  }
  return {
    competencies: competencies.map((c) => ({
      competency: c,
      criteria: (critsByComp.get(c.id) ?? []).map((cr) => ({
        criterion: cr,
        indicators: indicatorsByCrit.get(cr.id) ?? [],
      })),
    })),
  };
}

type WheelPoint = {
  competencyId: string;
  name: string;
  current: number;
  target: number;
};

function pointsForRadius(
  values: number[],
  cx: number,
  cy: number,
  radius: number,
): string {
  if (values.length === 0) return "";
  const step = (Math.PI * 2) / values.length;
  return values
    .map((v, i) => {
      const angle = -Math.PI / 2 + i * step;
      const r = ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * radius;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function CareerWheelChart({ points }: { points: WheelPoint[] }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.4;
  const axisCount = points.length;
  const ringValues = [1, 2, 3, 4];

  if (axisCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No competencies yet — add one to see the wheel.
      </p>
    );
  }

  const targetPoly = pointsForRadius(
    points.map((p) => p.target),
    cx,
    cy,
    radius,
  );
  const currentPoly = pointsForRadius(
    points.map((p) => p.current),
    cx,
    cy,
    radius,
  );

  return (
    <svg
      role="img"
      aria-label="Career wheel"
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto block h-auto w-full max-w-md"
    >
      <title>Career wheel</title>
      {/* Concentric scale rings */}
      {ringValues.map((rv) => {
        const r = ((rv - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * radius;
        return (
          <circle
            key={rv}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.15}
          />
        );
      })}
      {/* Axes */}
      {points.map((p, i) => {
        const angle = -Math.PI / 2 + i * ((Math.PI * 2) / axisCount);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const labelX = cx + Math.cos(angle) * (radius + 18);
        const labelY = cy + Math.sin(angle) * (radius + 18);
        return (
          <g key={p.competencyId}>
            <line
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              className="fill-muted-foreground"
            >
              {p.name}
            </text>
          </g>
        );
      })}
      {/* Target polygon */}
      <polygon
        points={targetPoly}
        className="fill-primary/10 stroke-primary/40"
        strokeWidth={1.5}
      />
      {/* Current polygon */}
      <polygon
        points={currentPoly}
        className="fill-primary/30 stroke-primary"
        strokeWidth={2}
      />
    </svg>
  );
}

export function CareerWheel({
  level,
  client,
}: {
  level: StoredLevel;
  client: SupabaseLike;
}) {
  const [points, setPoints] = useState<WheelPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLevelTree(client, level.id)
      .then(({ competencies, criteria, indicators }) => {
        if (cancelled) return;
        const tree = buildTree(competencies, criteria, indicators);
        const sat = computeSatisfaction(tree);
        const next: WheelPoint[] = competencies
          .filter((c) => c.deleted_at === null)
          .map((c) => {
            const point = sat.perCompetency.get(c.id) ?? {
              current: 1,
              target: 1,
            };
            return {
              competencyId: c.id,
              name: c.name,
              current: point.current,
              target: point.target,
            };
          });
        setPoints(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, level.id]);

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
      >
        {error}
      </p>
    );
  }
  if (points === null) {
    return (
      <p aria-busy="true" className="text-muted-foreground text-sm">
        Loading wheel…
      </p>
    );
  }

  return (
    <section
      aria-label="Career wheel"
      className="rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <CareerWheelChart points={points} />
      <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
          Current
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary/30" />
          Target
        </li>
      </ul>
    </section>
  );
}
