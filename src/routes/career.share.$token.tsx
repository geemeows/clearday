// Public unauthenticated route for reading a shared career-level snapshot.
// Calls the SECURITY DEFINER fn `career_share_read(token)` via the anon client;
// no auth required. Returns 404-style empty state when the token is unknown or
// revoked.

import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
import { readSharedLevel, type SharedTree } from "#/features/career/store";
import { PublicShareView } from "#/features/career/components/PublicShareView";
import type {
  CareerLevel,
  EvidenceKind,
  WheelDataPoint,
} from "#/features/career/components/career-data";
import { computeSatisfaction } from "#/features/career/components/career-data";

type ShareLoaderData =
  | { found: true; level: CareerLevel }
  | { found: false };

// Map a SharedTree (flat rows) → CareerLevel (nested component type)
function sharedTreeToCareerLevel(tree: SharedTree): CareerLevel {
  const evidenceByIndicator = new Map<string, typeof tree.evidence>();
  for (const ev of tree.evidence) {
    const bucket = evidenceByIndicator.get(ev.indicator_id) ?? [];
    bucket.push(ev);
    evidenceByIndicator.set(ev.indicator_id, bucket);
  }

  const competencies = tree.competencies.map((comp) => ({
    id: comp.id,
    name: comp.name,
    criteria: tree.criteria
      .filter((cr) => cr.competency_id === comp.id)
      .map((cr) => ({
        id: cr.id,
        name: cr.name,
        target: cr.target,
        indicators: tree.indicators
          .filter((ind) => ind.criterion_id === cr.id)
          .map((ind) => ({
            id: ind.id,
            code: ind.code ?? "",
            description: ind.description,
            notes: ind.notes ?? "",
            score: ind.score,
            target: cr.target,
            evidence: (evidenceByIndicator.get(ind.id) ?? []).map((ev) => ({
              id: ev.id,
              title: ev.title,
              url: ev.url,
              kind: (ev.url ? "link" : "text") as EvidenceKind,
              card_id: ev.card_id ?? undefined,
            })),
            comments: [],
          })),
      })),
  }));

  return {
    id: tree.level.id,
    title: tree.level.title,
    status: tree.level.status as "active" | "archived",
    created_at: new Date(tree.level.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    archived_at: tree.level.archived_at,
    sheet_id: null,
    sheet_url: null,
    last_synced_at: null,
    share_token: null,
    header: (tree.level.header ?? []) as Array<{ key: string; value: string }>,
    competencies,
    development_plan: [],
  };
}

export const Route = createFileRoute("/career/share/$token")({
  loader: async ({ params }): Promise<ShareLoaderData> => {
    const db = supabase as unknown as SupabaseLike;
    const tree = await readSharedLevel(db, params.token);
    if (!tree) return { found: false };
    return { found: true, level: sharedTreeToCareerLevel(tree) };
  },
  component: SharePageRoute,
  errorComponent: ShareErrorView,
});

function SharePageRoute() {
  const data = Route.useLoaderData();

  if (!data.found) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--background)",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}
        >
          Share link not found
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
          This link may have been revoked or does not exist.
        </div>
      </main>
    );
  }

  const { level } = data;
  const sat = computeSatisfaction(level);
  const criteriaData: WheelDataPoint[] = level.competencies.flatMap((c) =>
    c.criteria.map((cr) => {
      const s = sat.perCriterion[cr.id] ?? {
        avg: 0,
        target: cr.target,
        gap: cr.target,
      };
      return { id: cr.id, name: cr.name, current: s.avg, target: s.target, gap: s.gap };
    }),
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--background)" }}>
      <PublicShareView
        level={level}
        satPerCriterion={sat.perCriterion}
        criteriaData={criteriaData}
      />
    </main>
  );
}

function ShareErrorView() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>
        Failed to load share
      </div>
      <div style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
        Check your connection and try again.
      </div>
    </main>
  );
}
