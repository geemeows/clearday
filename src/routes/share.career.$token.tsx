// Public, read-only Career level page. Anon viewers fetch the tree via the
// SECURITY DEFINER fn `career_share_read` (migration 0030); the supabase
// anon client never touches the tree tables directly. No Clearday nav chrome
// — this surface is only the level title + header KV + tree + wheel.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CareerWheelChart } from "#/features/career/components/CareerWheel";
import {
  computeSatisfaction,
  type LevelTree,
} from "#/features/career/satisfaction";
import {
  readSharedLevel,
  type SharedTree,
  type StoredCompetency,
  type StoredCriterion,
  type StoredEvidence,
  type StoredIndicator,
} from "#/features/career/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

export const Route = createFileRoute("/share/career/$token")({
  component: SharePage,
});

export function SharePage() {
  const { token } = Route.useParams();
  const client = supabase as unknown as SupabaseLike;
  return <SharedLevelView token={token} client={client} />;
}

export function SharedLevelView({
  token,
  client,
}: {
  token: string;
  client: SupabaseLike;
}) {
  const [tree, setTree] = useState<SharedTree | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSharedLevel(client, token)
      .then((data) => {
        if (!cancelled) setTree(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, token]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      </main>
    );
  }

  if (tree === undefined) {
    return (
      <main
        aria-busy="true"
        className="mx-auto max-w-3xl p-8 text-muted-foreground text-sm"
      >
        Loading…
      </main>
    );
  }

  if (tree === null) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="font-semibold text-2xl text-foreground">
          Link unavailable
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          This share link has been revoked or no longer exists.
        </p>
      </main>
    );
  }

  const points = buildWheelPoints(tree);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">
          {tree.level.title}
        </h1>
        <p className="text-muted-foreground text-xs">Read-only share</p>
      </header>

      {tree.level.header.length > 0 && (
        <section
          aria-label="Level header"
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {tree.level.header.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: KV header rows have no stable id
              <div key={i} className="contents">
                <dt className="font-medium text-foreground">{row.key}</dt>
                <dd className="text-muted-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section
        aria-label="Career wheel"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <CareerWheelChart points={points} />
      </section>

      <SharedTreeView tree={tree} />
    </main>
  );
}

function buildWheelPoints(tree: SharedTree) {
  const indicatorsByCrit = groupBy(tree.indicators, (i) => i.criterion_id);
  const critsByComp = groupBy(tree.criteria, (c) => c.competency_id);
  const nested: LevelTree = {
    competencies: tree.competencies.map((c) => ({
      competency: c,
      criteria: (critsByComp.get(c.id) ?? []).map((cr) => ({
        criterion: cr,
        indicators: indicatorsByCrit.get(cr.id) ?? [],
      })),
    })),
  };
  const sat = computeSatisfaction(nested);
  return tree.competencies.map((c) => {
    const point = sat.perCompetency.get(c.id) ?? { current: 1, target: 1 };
    return {
      competencyId: c.id,
      name: c.name,
      current: point.current,
      target: point.target,
    };
  });
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k) ?? [];
    list.push(item);
    out.set(k, list);
  }
  return out;
}

function SharedTreeView({ tree }: { tree: SharedTree }) {
  const critsByComp = groupBy(tree.criteria, (c) => c.competency_id);
  const indicatorsByCrit = groupBy(tree.indicators, (i) => i.criterion_id);
  const evidenceByInd = groupBy(tree.evidence, (e) => e.indicator_id);

  return (
    <section
      aria-label="Competency tree"
      className="rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      {tree.competencies.length === 0 ? (
        <p className="text-muted-foreground text-sm">No competencies.</p>
      ) : (
        <ul aria-label="Competencies" className="space-y-4">
          {tree.competencies.map((c) => (
            <SharedCompetency
              key={c.id}
              competency={c}
              criteria={critsByComp.get(c.id) ?? []}
              indicatorsByCrit={indicatorsByCrit}
              evidenceByInd={evidenceByInd}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SharedCompetency({
  competency,
  criteria,
  indicatorsByCrit,
  evidenceByInd,
}: {
  competency: StoredCompetency;
  criteria: StoredCriterion[];
  indicatorsByCrit: Map<string, StoredIndicator[]>;
  evidenceByInd: Map<string, StoredEvidence[]>;
}) {
  return (
    <li>
      <h3 className="mb-1.5 font-semibold text-foreground text-base">
        {competency.name}
      </h3>
      {criteria.length === 0 ? (
        <p className="text-muted-foreground text-xs">No criteria.</p>
      ) : (
        <ul aria-label="Criteria" className="space-y-3 pl-2">
          {criteria.map((cr) => (
            <SharedCriterion
              key={cr.id}
              criterion={cr}
              indicators={indicatorsByCrit.get(cr.id) ?? []}
              evidenceByInd={evidenceByInd}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SharedCriterion({
  criterion,
  indicators,
  evidenceByInd,
}: {
  criterion: StoredCriterion;
  indicators: StoredIndicator[];
  evidenceByInd: Map<string, StoredEvidence[]>;
}) {
  return (
    <li>
      <p className="text-foreground text-sm">
        <span className="font-medium">{criterion.name}</span>
        <span className="ml-2 text-muted-foreground text-xs">
          target {criterion.target}
        </span>
      </p>
      {indicators.length > 0 && (
        <ul aria-label="Indicators" className="mt-1 space-y-1 pl-3">
          {indicators.map((ind) => (
            <SharedIndicatorRow
              key={ind.id}
              indicator={ind}
              evidence={evidenceByInd.get(ind.id) ?? []}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SharedIndicatorRow({
  indicator,
  evidence,
}: {
  indicator: StoredIndicator;
  evidence: StoredEvidence[];
}) {
  return (
    <li className="text-muted-foreground text-xs">
      <span className="font-mono">{indicator.code ?? "—"}</span>{" "}
      <span className="text-foreground">{indicator.description}</span>{" "}
      <span>· score {indicator.score}</span>
      {evidence.length > 0 && (
        <ul aria-label="Evidence" className="mt-1 list-disc space-y-0.5 pl-5">
          {evidence.map((e) => (
            <li key={e.id}>
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline"
                >
                  {e.title}
                </a>
              ) : (
                <span className="text-foreground">{e.title}</span>
              )}
              {e.note && <span className="ml-1">— {e.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
