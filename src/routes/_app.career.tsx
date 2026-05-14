// Career route — loader reads the active level tree from Supabase and passes
// it to CareerPage. Archived level trees are fetched for summary stats.
// All fixture data has been removed; this is the single source of truth.

import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
import {
  getLevelTree,
  getScaleLegend,
  getShareLinks,
  listEvidence,
  listLevels,
  type LevelTreeRows,
  type StoredEvidence,
  type StoredLevel,
  type StoredShare,
} from "#/features/career/store";
import { CareerPage } from "#/features/career/components/CareerPage";
import type {
  ArchivedLevel,
  CareerLevel,
  EvidenceKind,
  ScoreLegend,
} from "#/features/career/components/career-data";
import { CAREER_LEGEND, CAREER_LEGEND_DESC } from "#/features/career/components/career-data";

export type CareerLoaderData = {
  level: CareerLevel | null;
  archivedLevels: ArchivedLevel[];
  shares: StoredShare[];
  legend: ScoreLegend;
};

// ── View model helpers ────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export function buildCareerLevel(
  stored: StoredLevel,
  tree: LevelTreeRows,
  evidenceMap: Record<string, StoredEvidence[]>,
  shares: StoredShare[],
): CareerLevel {
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
            evidence: (evidenceMap[ind.id] ?? []).map((ev) => ({
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

  const activeShare = shares.find((s) => !s.revoked_at) ?? null;

  return {
    id: stored.id,
    title: stored.title,
    status: stored.status as "active" | "archived",
    created_at: fmtDate(stored.created_at),
    archived_at: stored.archived_at,
    sheet_id: stored.sheet_id,
    sheet_url: stored.sheet_id
      ? `https://docs.google.com/spreadsheets/d/${stored.sheet_id}`
      : null,
    last_synced_at: stored.last_synced_at
      ? fmtRelative(stored.last_synced_at)
      : null,
    share_token: activeShare?.token ?? null,
    header: (stored.header ?? []) as Array<{ key: string; value: string }>,
    competencies,
    development_plan: [],
  };
}

function buildArchivedLevel(stored: StoredLevel, tree: LevelTreeRows): ArchivedLevel {
  const scored = tree.indicators.filter((i) => i.score > 0);
  const avg = scored.length
    ? scored.reduce((s, i) => s + i.score, 0) / scored.length
    : 0;
  return {
    id: stored.id,
    title: stored.title,
    status: "archived",
    created_at: fmtDate(stored.created_at),
    archived_at: stored.archived_at ? fmtDate(stored.archived_at) : "",
    sheet_id: stored.sheet_id,
    sheet_url: stored.sheet_id
      ? `https://docs.google.com/spreadsheets/d/${stored.sheet_id}`
      : "#",
    last_synced_at: "archived",
    summary: {
      competencies: tree.competencies.length,
      criteria: tree.criteria.length,
      indicators: tree.indicators.length,
      evidence: 0,
      current_avg: avg,
    },
  };
}

function buildLegend(sl: {
  label_1: string;
  label_2: string;
  label_3: string;
  label_4: string;
}): ScoreLegend {
  return Object.fromEntries(
    ([1, 2, 3, 4] as const).map((n) => {
      const stored = sl[`label_${n}` as `label_${typeof n}`];
      return [
        n,
        {
          title: stored || CAREER_LEGEND[n] || "",
          desc: CAREER_LEGEND_DESC[n] ?? "",
        },
      ];
    }),
  );
}

// ── Loader ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/career")({
  loader: async (): Promise<CareerLoaderData> => {
    const db = supabase as unknown as SupabaseLike;
    const [allLevels, storedLegend] = await Promise.all([
      listLevels(db),
      getScaleLegend(db),
    ]);

    const activeStored = allLevels.find((l) => l.status === "active") ?? null;
    const archivedStored = allLevels.filter((l) => l.status === "archived");

    // Active level: full tree + evidence
    let level: CareerLevel | null = null;
    let shares: StoredShare[] = [];

    if (activeStored) {
      const [tree, shareLinks] = await Promise.all([
        getLevelTree(db, activeStored.id),
        getShareLinks(db, activeStored.id),
      ]);
      shares = shareLinks;

      const evidenceMap: Record<string, StoredEvidence[]> = {};
      if (tree.indicators.length > 0) {
        const results = await Promise.all(
          tree.indicators.map((ind) => listEvidence(db, ind.id)),
        );
        for (let i = 0; i < tree.indicators.length; i++) {
          evidenceMap[tree.indicators[i]!.id] = results[i]!;
        }
      }

      level = buildCareerLevel(activeStored, tree, evidenceMap, shareLinks);
    }

    // Archived levels: tree for summary stats
    const archivedTrees = await Promise.all(
      archivedStored.map((l) => getLevelTree(db, l.id)),
    );
    const archivedLevels = archivedStored.map((l, i) =>
      buildArchivedLevel(l, archivedTrees[i]!),
    );

    return {
      level,
      archivedLevels,
      shares,
      legend: buildLegend(storedLegend),
    };
  },

  component: CareerPageRoute,
  errorComponent: CareerErrorView,
});

function CareerPageRoute() {
  const { level, archivedLevels, shares, legend } = Route.useLoaderData();
  return (
    <main className="flex-1 overflow-auto">
      <CareerPage
        initialLevel={level}
        archivedLevels={archivedLevels}
        initialShares={shares}
        initialLegend={legend}
      />
    </main>
  );
}

function CareerErrorView() {
  return (
    <main style={{ flex: 1, overflow: "auto", padding: "24px" }}>
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          color: "var(--muted-foreground)",
          fontSize: 14,
        }}
      >
        Failed to load career data. Check your connection and refresh.
      </div>
    </main>
  );
}
