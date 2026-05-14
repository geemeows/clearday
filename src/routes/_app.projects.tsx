// Projects route — loader reads projects/columns/cards/links from Supabase
// and maps them to the ProjectDef view-model that ProjectsPage consumes.

import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
import type { StoredSignal } from "#/shared/signal";
import {
  listProjects,
  listColumns,
  listCards,
  listSignalsForCards,
  listTicketsForCards,
} from "#/features/projects/store";
import { listSignals } from "#/features/signals/store";
import type {
  ProjectDef,
  FixtureSignal,
  KanbanColumnDef,
  ProjectCard,
  CardPriority,
  CardDue,
} from "#/features/projects/components/ProjectsPage";
import { ProjectsPage } from "#/features/projects/components/ProjectsPage";

// ── Palette ───────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "var(--primary)",
  "#7c3aed",
  "#0891b2",
  "#d97706",
  "#dc2626",
  "#0d9488",
  "#6366f1",
  "#db2777",
];

// ── Mappers ───────────────────────────────────────────────────────────────────

function dateToDue(dueAt: string | null): CardDue {
  if (!dueAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const dueDay = new Date(dueAt);
  dueDay.setHours(0, 0, 0, 0);
  if (dueDay.getTime() === today.getTime()) return "today";
  if (dueDay.getTime() === tomorrow.getTime()) return "tomorrow";
  if (dueDay < weekEnd) return "this-week";
  return null;
}

function kindToSource(kind: string): string {
  if (kind.startsWith("pr_")) return "git";
  if (kind === "dm" || kind === "mention" || kind === "thread_reply")
    return "slack";
  if (kind === "meeting") return "cal";
  return "task";
}

function storedSignalToFixture(s: StoredSignal): FixtureSignal {
  const source = kindToSource(s.kind);
  const base: FixtureSignal = { id: s.id, source, title: s.title };
  if (source === "git") {
    base.repo = (s.payload.repo as string | undefined) ?? "";
    base.num = `#${s.source_id}`;
  } else if (source === "slack") {
    base.sub =
      ((s.payload.channel ?? s.payload.from) as string | undefined) ?? "";
  } else if (source === "cal") {
    base.sub = (s.payload.summary as string | undefined) ?? "";
  } else {
    base.sub = (s.payload.status as string | undefined) ?? "";
  }
  return base;
}

// ── Loader types ──────────────────────────────────────────────────────────────

type LoaderData = {
  projects: ProjectDef[];
  signals: FixtureSignal[];
};

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/projects")({
  loader: async (): Promise<LoaderData> => {
    const db = supabase as unknown as SupabaseLike;
    const storedProjects = await listProjects(db);

    const [allColumns, allCards] = await Promise.all([
      Promise.all(storedProjects.map((p) => listColumns(db, p.id))),
      Promise.all(storedProjects.map((p) => listCards(db, p.id))),
    ]);

    const allCardIds = allCards.flat().map((c) => c.id);
    const [signalLinks, ticketLinks, storedSignals] = await Promise.all([
      listSignalsForCards(db, allCardIds),
      listTicketsForCards(db, allCardIds),
      listSignals(db),
    ]);

    // Group signal links by card_id (active, non-tombstoned only)
    const signalsByCard = new Map<string, string[]>();
    for (const link of signalLinks) {
      if (!link.signal_id || link.deleted_at) continue;
      const arr = signalsByCard.get(link.card_id) ?? [];
      arr.push(link.signal_id);
      signalsByCard.set(link.card_id, arr);
    }

    // First ticket per card (primary linked ticket)
    const ticketByCard = new Map<string, (typeof ticketLinks)[0]>();
    for (const t of ticketLinks) {
      if (!ticketByCard.has(t.card_id)) ticketByCard.set(t.card_id, t);
    }

    const projects: ProjectDef[] = storedProjects.map((p, idx) => {
      const columns = allColumns[idx] ?? [];
      const cards = allCards[idx] ?? [];
      const colDefs: KanbanColumnDef[] = columns.map((c) => ({
        id: c.id,
        name: c.name,
      }));

      const projectCards: ProjectCard[] = cards.map((c) => {
        const ticket = ticketByCard.get(c.id) ?? null;
        return {
          id: c.id,
          col: c.column_id,
          title: c.title,
          desc: c.body ?? "",
          priority: (c.priority as CardPriority) ?? "P3",
          labels: c.tags,
          due: dateToDue(c.due_at),
          linked: ticket
            ? { source: ticket.source, id: ticket.ext_id, repo: ticket.source }
            : null,
          linkedSignals: signalsByCard.get(c.id) ?? [],
        };
      });

      return {
        id: p.id,
        name: p.name,
        color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
        activeCol: columns[0]?.id ?? "",
        columns: colDefs,
        cards: projectCards,
      };
    });

    return {
      projects,
      signals: storedSignals.map(storedSignalToFixture),
    };
  },
  component: ProjectsPageRoute,
  errorComponent: ProjectsErrorView,
});

function ProjectsPageRoute() {
  const { projects, signals } = Route.useLoaderData();
  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ProjectsPage initialProjects={projects} availableSignals={signals} />
    </main>
  );
}

function ProjectsErrorView() {
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
        Failed to load projects. Check your connection and refresh.
      </div>
    </main>
  );
}
