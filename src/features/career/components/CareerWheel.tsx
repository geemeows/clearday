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

function radiusFor(value: number, radius: number): number {
  return (value / SCALE_MAX) * radius;
}

function polarXY(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function polygonPointsAt(
  values: number[],
  angles: number[],
  cx: number,
  cy: number,
  radius: number,
): string {
  return values
    .map((v, i) => {
      const [x, y] = polarXY(cx, cy, radiusFor(v, radius), angles[i]);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function CareerWheelChart({ points }: { points: WheelPoint[] }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const padding = 56;
  const radius = (size - padding * 2) / 2;
  const axisCount = points.length;
  const ringValues = [1, 2, 3, 4];

  if (axisCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No competencies yet — add one to see the wheel.
      </p>
    );
  }

  const angles = points.map((_, i) => (360 / axisCount) * i);
  const targetPoly = polygonPointsAt(
    points.map((p) => p.target),
    angles,
    cx,
    cy,
    radius,
  );
  const currentPoly = polygonPointsAt(
    points.map((p) => p.current),
    angles,
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
      {ringValues.map((rv) => (
        <circle
          key={rv}
          cx={cx}
          cy={cy}
          r={radiusFor(rv, radius)}
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth={1}
        />
      ))}
      {/* Axes */}
      {points.map((p, i) => {
        const a = angles[i];
        const [x, y] = polarXY(cx, cy, radius, a);
        return (
          <line
            key={p.competencyId}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--hairline-soft)"
            strokeWidth={1}
          />
        );
      })}
      {/* Target polygon — dashed outline */}
      <polygon
        points={targetPoly}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.25}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      {/* Current polygon — filled */}
      <polygon
        points={currentPoly}
        className="fill-primary/20 stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Current point dots */}
      {points.map((p, i) => {
        const [x, y] = polarXY(cx, cy, radiusFor(p.current, radius), angles[i]);
        return (
          <circle
            key={`dot-${p.competencyId}`}
            cx={x}
            cy={y}
            r={3.5}
            className="fill-primary"
            stroke="var(--background)"
            strokeWidth={1.5}
          />
        );
      })}
      {/* Per-axis labels: name + current / target */}
      {points.map((p, i) => {
        const a = angles[i];
        const [lx, ly] = polarXY(cx, cy, radius + 26, a);
        const anchor =
          a > 5 && a < 175 ? "start" : a > 185 && a < 355 ? "end" : "middle";
        const dy =
          a > 95 && a < 265
            ? 12
            : a < 5 || a > 355 || (a > 175 && a < 185)
              ? 4
              : 0;
        return (
          <g key={`label-${p.competencyId}`}>
            <text
              x={lx}
              y={ly + dy}
              textAnchor={anchor}
              fontSize={11}
              fontWeight={600}
              className="fill-foreground"
            >
              {p.name}
            </text>
            <text
              x={lx}
              y={ly + dy + 13}
              textAnchor={anchor}
              fontSize={10}
              className="fill-muted-foreground"
            >
              {p.current.toFixed(1)} / {p.target.toFixed(1)}
            </text>
          </g>
        );
      })}
      {/* Ring value labels along top axis */}
      {ringValues.map((rv) => (
        <text
          key={`ring-${rv}`}
          x={cx + 3}
          y={cy - radiusFor(rv, radius) + 3}
          fontSize={9}
          fontWeight={500}
          fill="var(--muted-soft)"
        >
          {rv}
        </text>
      ))}
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
          <span
            aria-hidden="true"
            className="inline-block h-2 w-3 border-dashed border-muted-foreground border-t"
          />
          Target
        </li>
      </ul>
    </section>
  );
}
