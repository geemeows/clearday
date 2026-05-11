import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CardDetailPane } from "#/features/projects/CardDetailPane";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import {
  formatGithubKey,
  githubKeyUrl,
  parseGithubLink,
} from "#/features/projects/links/github";
import {
  moveBetweenColumns,
  type OrderableCard,
  reorderColumns,
  reorderWithinColumn,
} from "#/features/projects/order";
import {
  type CardPatch,
  type ColumnPatch,
  createCard,
  createColumn,
  deleteCard,
  deleteColumn,
  linkTicket,
  listCards,
  listColumns,
  listProjects,
  listTicketsForCards,
  type StoredCard,
  type StoredCardTicket,
  type StoredColumn,
  type StoredProject,
  unlinkTicket,
  updateCard,
  updateColumn,
  updateTicketMeta,
} from "#/features/projects/store";
import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

const STALE_MS = 15 * 60 * 1000;

const searchSchema = z.object({
  card: z.string().optional(),
});

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: searchSchema,
  component: ProjectBoardPage,
});

function ProjectBoardPage() {
  const { projectId } = Route.useParams();
  const { card: initialCardId } = Route.useSearch();
  const router = useRouter();
  const client = supabase as unknown as SupabaseLike;

  const [allProjects, setAllProjects] = useState<StoredProject[]>([]);
  const [project, setProject] = useState<StoredProject | null>(null);
  const [columns, setColumns] = useState<StoredColumn[]>([]);
  const [cards, setCards] = useState<StoredCard[]>([]);
  const [tickets, setTickets] = useState<StoredCardTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listProjects(client),
      listColumns(client, projectId),
      listCards(client, projectId),
    ])
      .then(async ([projects, cols, cds]) => {
        if (cancelled) return;
        const found = projects.find((p) => p.id === projectId) ?? null;
        setAllProjects(projects);
        setProject(found);
        setColumns(cols);
        setCards(cds);
        setLoading(false);
        const tks = await listTicketsForCards(
          client,
          cds.map((c) => c.id),
        );
        if (!cancelled) setTickets(tks);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleAddCard = async (columnId: string, title: string) => {
    const cardsInColumn = cards.filter((c) => c.column_id === columnId);
    const nextOrder = cardsInColumn.length;
    const id = crypto.randomUUID();
    const newCard: StoredCard = {
      id,
      project_id: projectId,
      column_id: columnId,
      order: nextOrder,
      title,
      body: null,
      priority: null,
      tags: [],
      due_at: null,
      created_at: new Date().toISOString(),
    };
    setCards((prev) => [...prev, newCard]);
    try {
      await createCard(client, {
        id,
        project_id: projectId,
        column_id: columnId,
        order: nextOrder,
        title,
      });
    } catch (e) {
      setCards((prev) => prev.filter((c) => c.id !== id));
      setError(e instanceof Error ? e.message : "failed to create card");
    }
  };

  const handleUpdateCard = async (cardId: string, patch: CardPatch) => {
    let nextPatch = patch;
    // When moving columns via the detail pane, place the card at the bottom of
    // the destination and write the new dense order alongside the column change.
    if (patch.column_id != null) {
      const destCount = cards.filter(
        (c) => c.column_id === patch.column_id && c.id !== cardId,
      ).length;
      nextPatch = { ...patch, order: destCount };
    }
    const prev = cards;
    setCards((cs) =>
      cs.map((c) => (c.id === cardId ? { ...c, ...nextPatch } : c)),
    );
    try {
      await updateCard(client, cardId, nextPatch);
    } catch (e) {
      setCards(prev);
      setError(e instanceof Error ? e.message : "failed to update card");
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    const prev = cards;
    setCards((cs) => cs.filter((c) => c.id !== cardId));
    try {
      await deleteCard(client, cardId);
    } catch (e) {
      setCards(prev);
      setError(e instanceof Error ? e.message : "failed to delete card");
    }
  };

  const handleMoveCard = async (
    cardId: string,
    toColumnId: string,
    afterId: string | null,
  ) => {
    const movedCard = cards.find((c) => c.id === cardId);
    if (!movedCard) return;
    const fromColumnId = movedCard.column_id;

    const orderable: OrderableCard[] = cards.map((c) => ({
      id: c.id,
      order: c.order,
      column_id: c.column_id,
    }));

    let affected: OrderableCard[];
    if (fromColumnId === toColumnId) {
      affected = reorderWithinColumn(
        orderable.filter((c) => c.column_id === fromColumnId),
        cardId,
        afterId,
      );
    } else {
      const result = moveBetweenColumns(orderable, cardId, toColumnId, afterId);
      affected = result.filter(
        (c) => c.column_id === fromColumnId || c.column_id === toColumnId,
      );
    }

    const prev = cards;
    setCards((cs) =>
      cs.map((c) => {
        const a = affected.find((r) => r.id === c.id);
        return a ? { ...c, column_id: a.column_id, order: a.order } : c;
      }),
    );

    try {
      await Promise.all(
        affected.map((a) =>
          updateCard(client, a.id, { column_id: a.column_id, order: a.order }),
        ),
      );
    } catch (e) {
      setCards(prev);
      setError(e instanceof Error ? e.message : "failed to move card");
    }
  };

  const handleUpdateColumn = async (colId: string, patch: ColumnPatch) => {
    const prev = columns;
    setColumns((cs) =>
      cs.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    );
    try {
      await updateColumn(client, colId, patch);
    } catch (e) {
      setColumns(prev);
      setError(e instanceof Error ? e.message : "failed to update column");
    }
  };

  const handleDeleteColumn = async (colId: string) => {
    const prev = columns;
    const prevCards = cards;
    setColumns((cs) => cs.filter((c) => c.id !== colId));
    setCards((cs) => cs.filter((c) => c.column_id !== colId));
    try {
      await deleteColumn(client, colId);
    } catch (e) {
      setColumns(prev);
      setCards(prevCards);
      setError(e instanceof Error ? e.message : "failed to delete column");
    }
  };

  const handleAddColumn = async (name: string) => {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const nextOrder = sorted.length;
    const id = crypto.randomUUID();
    const newCol: StoredColumn = {
      id,
      project_id: projectId,
      name,
      order: nextOrder,
      wip_limit: null,
    };
    setColumns((prev) => [...prev, newCol]);
    try {
      await createColumn(client, {
        id,
        project_id: projectId,
        name,
        order: nextOrder,
      });
    } catch (e) {
      setColumns((prev) => prev.filter((c) => c.id !== id));
      setError(e instanceof Error ? e.message : "failed to add column");
    }
  };

  const handleReorderColumns = async (
    movedId: string,
    afterId: string | null,
  ) => {
    const orderable = columns.map((c) => ({ id: c.id, order: c.order }));
    const reordered = reorderColumns(orderable, movedId, afterId);
    const prev = columns;
    setColumns((cs) =>
      cs.map((c) => {
        const r = reordered.find((x) => x.id === c.id);
        return r ? { ...c, order: r.order } : c;
      }),
    );
    try {
      await Promise.all(
        reordered.map((r) => updateColumn(client, r.id, { order: r.order })),
      );
    } catch (e) {
      setColumns(prev);
      setError(e instanceof Error ? e.message : "failed to reorder columns");
    }
  };

  const handleLinkGithub = async (
    cardId: string,
    input: string,
  ): Promise<{ error?: string } | undefined> => {
    const key = parseGithubLink(input);
    if (!key) return { error: "not a GitHub URL or owner/repo#N" };
    const extId = formatGithubKey(key);
    if (
      tickets.some(
        (t) =>
          t.card_id === cardId && t.source === "github" && t.ext_id === extId,
      )
    ) {
      return { error: "already linked" };
    }
    const id = crypto.randomUUID();
    const url = githubKeyUrl(key);
    const optimistic: StoredCardTicket = {
      id,
      card_id: cardId,
      source: "github",
      ext_id: extId,
      url,
      status: null,
      assignee: null,
      last_seen_at: null,
      created_at: new Date().toISOString(),
    };
    setTickets((prev) => [...prev, optimistic]);
    try {
      await linkTicket(client, {
        id,
        card_id: cardId,
        source: "github",
        ext_id: extId,
        url,
      });
    } catch (e) {
      setTickets((prev) => prev.filter((t) => t.id !== id));
      return { error: e instanceof Error ? e.message : "link failed" };
    }
    // Fire-and-forget metadata refresh.
    void refreshTicket(id, key);
  };

  const refreshTicket = async (
    ticketId: string,
    keyOverride?: { owner: string; repo: string; number: number },
  ) => {
    const ticket = keyOverride
      ? null
      : (tickets.find((t) => t.id === ticketId) ?? null);
    let key = keyOverride;
    if (!key && ticket) {
      const parsed = parseGithubLink(`${ticket.ext_id}`);
      if (!parsed) return;
      key = parsed;
    }
    if (!key) return;
    try {
      const out = (await apiFetch("/api/projects/links/github/refresh", {
        method: "POST",
        body: {
          ticket_id: ticketId,
          owner: key.owner,
          repo: key.repo,
          number: key.number,
        },
      })) as
        | {
            ok: true;
            meta: {
              status: string;
              assignee: string | null;
              last_seen_at: string;
            };
          }
        | { ok: false; reason: string; error: string };
      if (out.ok) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? {
                  ...t,
                  status: out.meta.status,
                  assignee: out.meta.assignee,
                  last_seen_at: out.meta.last_seen_at,
                }
              : t,
          ),
        );
        try {
          await updateTicketMeta(client, ticketId, {
            status: out.meta.status,
            assignee: out.meta.assignee,
            last_seen_at: out.meta.last_seen_at,
          });
        } catch {}
      }
    } catch {
      // Network/Worker errors are non-fatal: chip stays in degraded state.
    }
  };

  const handleUnlinkTicket = async (ticketId: string) => {
    const prev = tickets;
    setTickets((ts) => ts.filter((t) => t.id !== ticketId));
    try {
      await unlinkTicket(client, ticketId);
    } catch (e) {
      setTickets(prev);
      setError(e instanceof Error ? e.message : "failed to unlink");
    }
  };

  return (
    <ProjectBoardView
      project={project}
      allProjects={allProjects}
      columns={columns}
      cards={cards}
      tickets={tickets}
      loading={loading}
      error={error}
      initialCardId={initialCardId}
      onAddCard={handleAddCard}
      onUpdateCard={handleUpdateCard}
      onDeleteCard={handleDeleteCard}
      onMoveCard={handleMoveCard}
      onUpdateColumn={handleUpdateColumn}
      onDeleteColumn={handleDeleteColumn}
      onAddColumn={handleAddColumn}
      onReorderColumns={handleReorderColumns}
      onLinkGithub={handleLinkGithub}
      onUnlinkTicket={handleUnlinkTicket}
      onRefreshTicket={(id) => refreshTicket(id)}
      onNavigateToProject={(id) =>
        router.navigate({
          to: "/projects/$projectId",
          params: { projectId: id },
        })
      }
      onNewProject={() =>
        router.navigate({ to: "/projects", search: { mode: "new" } })
      }
    />
  );
}

export function ProjectBoardView({
  project,
  allProjects,
  columns,
  cards,
  tickets,
  loading,
  error,
  initialCardId,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onUpdateColumn,
  onDeleteColumn,
  onAddColumn,
  onReorderColumns,
  onLinkGithub,
  onUnlinkTicket,
  onRefreshTicket,
  onNavigateToProject,
  onNewProject,
}: {
  project: StoredProject | null;
  allProjects?: StoredProject[];
  columns: StoredColumn[];
  cards: StoredCard[];
  tickets?: StoredCardTicket[];
  loading: boolean;
  error: string | null;
  initialCardId?: string;
  onAddCard: (columnId: string, title: string) => void;
  onUpdateCard?: (cardId: string, patch: CardPatch) => void;
  onDeleteCard?: (cardId: string) => void;
  onMoveCard?: (
    cardId: string,
    toColumnId: string,
    afterId: string | null,
  ) => void;
  onUpdateColumn?: (colId: string, patch: ColumnPatch) => void;
  onDeleteColumn?: (colId: string) => void;
  onAddColumn?: (name: string) => void;
  onReorderColumns?: (movedId: string, afterId: string | null) => void;
  onLinkGithub?: (
    cardId: string,
    input: string,
  ) => Promise<{ error?: string } | undefined>;
  onUnlinkTicket?: (ticketId: string) => void;
  onRefreshTicket?: (ticketId: string) => void;
  onNavigateToProject?: (id: string) => void;
  onNewProject?: () => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    initialCardId ?? null,
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedCard = selectedCardId
    ? (cards.find((c) => c.id === selectedCardId) ?? null)
    : null;

  const selectedTickets = selectedCardId
    ? (tickets ?? []).filter((t) => t.card_id === selectedCardId)
    : [];

  // On-open stale refresh: when the detail pane opens, fire a background
  // refresh for any linked ticket whose last_seen_at is older than ~15
  // minutes (or has never been seen yet).
  const lastRefreshedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedCardId || !onRefreshTicket) return;
    const now = Date.now();
    for (const t of selectedTickets) {
      if (lastRefreshedRef.current.has(t.id)) continue;
      const seen = t.last_seen_at ? Date.parse(t.last_seen_at) : 0;
      if (!t.last_seen_at || now - seen > STALE_MS) {
        lastRefreshedRef.current.add(t.id);
        onRefreshTicket(t.id);
      }
    }
  }, [selectedCardId, selectedTickets, onRefreshTicket]);

  // Shared ref for tracking the card currently being dragged (avoids
  // dataTransfer serialization in tests and removes a round-trip through the
  // browser clipboard security boundary).
  const dragCardIdRef = useRef<string | null>(null);

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-x-3 border-b border-border px-6 py-4">
        {allProjects && allProjects.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={switcherOpen}
              onClick={() => setSwitcherOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 font-semibold text-[30px] text-foreground leading-[1.2] hover:bg-accent"
              style={{ letterSpacing: "-0.6px" }}
            >
              {project?.name ?? "Project"}
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </button>
            {switcherOpen && (
              <div
                role="listbox"
                aria-label="Switch project"
                className="absolute left-0 top-full z-50 mt-1 min-w-48 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
              >
                {allProjects.map((p) => (
                  <button
                    key={p.id}
                    role="option"
                    aria-selected={p.id === project?.id}
                    type="button"
                    onClick={() => {
                      onNavigateToProject?.(p.id);
                      setSwitcherOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent aria-selected:font-medium"
                  >
                    {p.name}
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => {
                    onNewProject?.();
                    setSwitcherOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground text-sm hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New project
                </button>
              </div>
            )}
          </div>
        ) : (
          <h1
            className="font-semibold text-[30px] text-foreground leading-[1.2]"
            style={{ letterSpacing: "-0.6px" }}
          >
            {project?.name ?? "Project"}
          </h1>
        )}
        <div
          aria-hidden="true"
          className="h-[22px] w-px bg-border"
        />
        <span className="ml-auto text-[12px] text-muted-foreground leading-[1.3]">
          {cards.length} cards · {columns.length} columns
        </span>
        <div>
          <button
            type="button"
            aria-label="Column settings"
            onClick={() => setSettingsOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error && (
        <div className="px-6 pt-4">
          <p
            role="alert"
            className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
          >
            {error}
          </p>
        </div>
      )}

      {loading && !error && (
        <p aria-busy="true" className="px-6 pt-4 text-muted-foreground text-sm">
          Loading…
        </p>
      )}

      {!loading && (
        <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
          {[...columns]
            .sort((a, b) => a.order - b.order)
            .map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cards.filter((c) => c.column_id === col.id)}
                allColumns={columns}
                allCards={cards}
                tickets={tickets ?? []}
                onAddCard={(title) => onAddCard(col.id, title)}
                onSelectCard={setSelectedCardId}
                onMoveCard={onMoveCard}
                dragCardIdRef={dragCardIdRef}
              />
            ))}
        </div>
      )}

      {selectedCard && (
        <CardDetailPane
          card={selectedCard}
          columns={columns}
          tickets={selectedTickets}
          onLinkGithub={
            onLinkGithub
              ? (input) => onLinkGithub(selectedCard.id, input)
              : undefined
          }
          onUnlinkTicket={onUnlinkTicket}
          onRefreshTicket={onRefreshTicket}
          onChange={(patch) => onUpdateCard?.(selectedCard.id, patch)}
          onDelete={() => {
            onDeleteCard?.(selectedCard.id);
            setSelectedCardId(null);
          }}
          onClose={() => setSelectedCardId(null)}
        />
      )}

      {settingsOpen && (
        <ColumnSettingsPanel
          columns={columns}
          cards={cards}
          onRename={(id, name) => onUpdateColumn?.(id, { name })}
          onSetWipLimit={(id, wip_limit) => onUpdateColumn?.(id, { wip_limit })}
          onDelete={(id) => onDeleteColumn?.(id)}
          onAdd={(name) => onAddColumn?.(name)}
          onReorder={(movedId, afterId) => onReorderColumns?.(movedId, afterId)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}

function ColumnSettingsPanel({
  columns,
  cards,
  onRename,
  onSetWipLimit,
  onDelete,
  onAdd,
  onReorder,
  onClose,
}: {
  columns: StoredColumn[];
  cards: StoredCard[];
  onRename: (id: string, name: string) => void;
  onSetWipLimit: (id: string, wip_limit: number | null) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string) => void;
  onReorder: (movedId: string, afterId: string | null) => void;
  onClose: () => void;
}) {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const [draftNames, setDraftNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c.id, c.name])),
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newColName, setNewColName] = useState("");

  // Keep draft names in sync when columns change (e.g. after add).
  useEffect(() => {
    setDraftNames((prev) => {
      const next = { ...prev };
      for (const col of columns) {
        if (!(col.id in next)) next[col.id] = col.name;
      }
      return next;
    });
  }, [columns]);

  const moveUp = (colId: string) => {
    const idx = sorted.findIndex((c) => c.id === colId);
    if (idx <= 0) return;
    const afterId = idx >= 2 ? sorted[idx - 2].id : null;
    onReorder(colId, afterId);
  };

  const moveDown = (colId: string) => {
    const idx = sorted.findIndex((c) => c.id === colId);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const afterId = sorted[idx + 1].id;
    onReorder(colId, afterId);
  };

  const handleAddColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    onAdd(name);
    setNewColName("");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Column settings"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border bg-background shadow-xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="font-semibold text-foreground text-sm">
            Column settings
          </span>
          <button
            type="button"
            aria-label="Close column settings"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          {sorted.map((col, idx) => {
            const cardCount = cards.filter(
              (c) => c.column_id === col.id,
            ).length;
            const isLast = sorted.length === 1;
            const isDeleting = deleteConfirmId === col.id;

            return (
              <div
                key={col.id}
                className="rounded-md border border-border bg-card p-3"
              >
                {/* Name row */}
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label={`Move ${col.name} up`}
                      disabled={idx === 0}
                      onClick={() => moveUp(col.id)}
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${col.name} down`}
                      disabled={idx === sorted.length - 1}
                      onClick={() => moveDown(col.id)}
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    aria-label={`Rename column ${col.name}`}
                    value={draftNames[col.id] ?? col.name}
                    onChange={(e) =>
                      setDraftNames((prev) => ({
                        ...prev,
                        [col.id]: e.target.value,
                      }))
                    }
                    onBlur={() => {
                      const trimmed = (draftNames[col.id] ?? "").trim();
                      if (trimmed && trimmed !== col.name) {
                        onRename(col.id, trimmed);
                      } else if (!trimmed) {
                        setDraftNames((prev) => ({
                          ...prev,
                          [col.id]: col.name,
                        }));
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-sm outline-none focus:border-border focus:bg-muted"
                  />
                  <button
                    type="button"
                    aria-label={
                      isLast
                        ? "Cannot delete the only column"
                        : `Delete column ${col.name}`
                    }
                    title={
                      isLast
                        ? "Projects must have at least one column"
                        : undefined
                    }
                    disabled={isLast}
                    onClick={() =>
                      setDeleteConfirmId(isDeleting ? null : col.id)
                    }
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* WIP limit row */}
                <div className="mt-2 flex items-center gap-2 pl-8">
                  <label
                    htmlFor={`wip-${col.id}`}
                    className="shrink-0 text-muted-foreground text-xs"
                  >
                    WIP limit
                  </label>
                  <input
                    id={`wip-${col.id}`}
                    type="number"
                    min={1}
                    placeholder="none"
                    value={col.wip_limit ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      onSetWipLimit(
                        col.id,
                        val === ""
                          ? null
                          : Math.max(1, Number.parseInt(val, 10)),
                      );
                    }}
                    className="w-20 rounded border border-border bg-muted px-2 py-0.5 text-right text-foreground text-xs outline-none focus:border-primary"
                  />
                </div>

                {/* Delete confirm */}
                {isDeleting && (
                  <div className="mt-2 rounded bg-destructive/10 p-2 pl-8">
                    <p className="text-destructive text-xs">
                      {cardCount > 0
                        ? `Delete "${col.name}" and its ${cardCount} card${cardCount === 1 ? "" : "s"}?`
                        : `Delete "${col.name}"?`}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        aria-label={`Confirm delete ${col.name}`}
                        onClick={() => {
                          onDelete(col.id);
                          setDeleteConfirmId(null);
                        }}
                        className="rounded bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add column */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="New column name"
              placeholder="Column name…"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddColumn();
                }
              }}
              className="min-w-0 flex-1 rounded border border-border bg-muted px-2 py-1 text-foreground text-sm outline-none focus:border-primary placeholder:text-muted-foreground"
            />
            <button
              type="button"
              aria-label="Add column"
              disabled={!newColName.trim()}
              onClick={handleAddColumn}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function KanbanColumn({
  column,
  cards,
  allColumns,
  allCards,
  tickets,
  onAddCard,
  onSelectCard,
  onMoveCard,
  dragCardIdRef,
}: {
  column: StoredColumn;
  cards: StoredCard[];
  allColumns: StoredColumn[];
  allCards: StoredCard[];
  tickets?: StoredCardTicket[];
  onAddCard: (title: string) => void;
  onSelectCard: (cardId: string) => void;
  onMoveCard?: (
    cardId: string,
    toColumnId: string,
    afterId: string | null,
  ) => void;
  dragCardIdRef: { current: string | null };
}) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks which card the drag cursor last entered; used as afterId on drop.
  // undefined = no card entered yet this drag session.
  const [dropTargetId, setDropTargetId] = useState<string | undefined>(
    undefined,
  );

  const sorted = [...cards].sort((a, b) => a.order - b.order);

  const startCompose = () => {
    setComposing(true);
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) onAddCard(trimmed);
    setDraft("");
    setComposing(false);
  };

  const cancel = () => {
    setDraft("");
    setComposing(false);
  };

  const wipOver = column.wip_limit != null && cards.length > column.wip_limit;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const draggedId = dragCardIdRef.current;
    if (!draggedId) return;
    dragCardIdRef.current = null;

    // Use the last hovered card as afterId; fall back to placing at the bottom
    // of the column (last sorted card), or null for an empty column.
    const afterId =
      dropTargetId !== undefined
        ? dropTargetId
        : sorted.length > 0
          ? sorted[sorted.length - 1].id
          : null;

    onMoveCard?.(draggedId, column.id, afterId);
    setDropTargetId(undefined);
  };

  const handleKeyboardMove = (cardId: string, direction: "left" | "right") => {
    const sortedCols = [...allColumns].sort((a, b) => a.order - b.order);
    const myIdx = sortedCols.findIndex((c) => c.id === column.id);
    const targetIdx = direction === "left" ? myIdx - 1 : myIdx + 1;
    // Clamp: do nothing at the boundary columns.
    if (targetIdx < 0 || targetIdx >= sortedCols.length) return;
    const targetCol = sortedCols[targetIdx];
    const targetCards = allCards
      .filter((c) => c.column_id === targetCol.id)
      .sort((a, b) => a.order - b.order);
    // Place at the bottom of the target column.
    const afterId =
      targetCards.length > 0 ? targetCards[targetCards.length - 1].id : null;
    onMoveCard?.(cardId, targetCol.id, afterId);
  };

  return (
    <article
      aria-label={column.name}
      data-drag-over={isDragOver ? "true" : undefined}
      className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card transition-colors"
      style={
        isDragOver
          ? {
              background: "var(--primary-disabled)",
              borderColor: "var(--primary)",
              borderStyle: "dashed",
              borderWidth: 1.5,
            }
          : undefined
      }
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDragOver) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the column itself, not a child.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">
            {column.name}
          </span>
          <span
            className={
              wipOver
                ? "rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive"
                : "rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            }
          >
            {cards.length}
            {column.wip_limit != null ? `/${column.wip_limit}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={startCompose}
          aria-label={`Add card to ${column.name}`}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </header>

      <ul
        aria-label={`${column.name} cards`}
        className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2"
      >
        {sorted.map((card) => (
          <li
            key={card.id}
            onDragEnter={() => {
              // Don't count entering the dragged card's own li as a drop target.
              if (dragCardIdRef.current !== card.id) {
                setDropTargetId(card.id);
              }
            }}
          >
            <CardChip
              card={card}
              tickets={(tickets ?? []).filter((t) => t.card_id === card.id)}
              onClick={() => onSelectCard(card.id)}
              onDragStart={() => {
                dragCardIdRef.current = card.id;
                setDropTargetId(undefined);
              }}
              onKeyboardMove={(dir) => handleKeyboardMove(card.id, dir)}
            />
          </li>
        ))}

        {sorted.length === 0 && !composing && (
          <li
            aria-hidden="true"
            className="px-2 py-4 text-center text-[11px] text-muted-foreground/70"
          >
            Empty · drop cards here
          </li>
        )}

        {composing && (
          <li>
            <div className="rounded-md border border-primary/50 bg-background p-2 shadow-sm">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit();
                  } else if (e.key === "Escape") {
                    cancel();
                  }
                }}
                placeholder="Card title…"
                className="w-full bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
                aria-label="New card title"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={commit}
                  disabled={!draft.trim()}
                  className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </li>
        )}
      </ul>
    </article>
  );
}

export function dueRelative(
  dueAt: string,
  now: Date,
): "today" | "tomorrow" | null {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(due) - startOfDay(now)) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return null;
}

function CardChip({
  card,
  tickets,
  onClick,
  onDragStart,
  onKeyboardMove,
}: {
  card: StoredCard;
  tickets?: StoredCardTicket[];
  onClick: () => void;
  onDragStart?: () => void;
  onKeyboardMove?: (direction: "left" | "right") => void;
}) {
  return (
    <button
      type="button"
      aria-label={card.title}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onKeyboardMove?.("left");
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onKeyboardMove?.("right");
        }
      }}
      className="w-full cursor-grab rounded-md border border-border bg-background px-3 py-2 text-left shadow-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
    >
      {(card.priority || card.due_at || (tickets ?? []).length > 0) && (
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {card.priority && (
          <span
            data-priority={card.priority}
            className="inline-flex items-center rounded-md px-1.5 py-px text-[9px] font-medium leading-[1.4]"
            style={
              card.priority === "P1"
                ? {
                    background: "var(--danger-soft)",
                    color: "var(--destructive)",
                  }
                : card.priority === "P2"
                  ? {
                      background: "var(--warn-soft)",
                      color: "var(--warn)",
                    }
                  : {
                      background: "var(--secondary)",
                      color: "var(--muted-foreground)",
                    }
            }
          >
            {card.priority}
          </span>
        )}
        {card.due_at &&
          (() => {
            const rel = dueRelative(card.due_at, new Date());
            if (rel === "today") {
              return (
                <span
                  data-due="today"
                  className="inline-flex items-center rounded-md px-1.5 py-px font-medium text-[9px] leading-[1.4]"
                  style={{
                    background: "var(--primary-disabled)",
                    color: "var(--primary-active)",
                  }}
                >
                  DUE TODAY
                </span>
              );
            }
            if (rel === "tomorrow") {
              return (
                <span
                  data-due="tomorrow"
                  className="inline-flex items-center rounded-md px-1.5 py-px font-medium text-[9px] leading-[1.4]"
                  style={{
                    background: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  TOMORROW
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Calendar className="h-2.5 w-2.5" />
                {card.due_at.slice(0, 10)}
              </span>
            );
          })()}
        {(tickets ?? []).map((t) => (
          <span
            key={t.id}
            data-testid={`card-chip-ticket-${t.id}`}
            title={t.status ?? "reconnect to refresh"}
            className="inline-flex items-center gap-1"
          >
            <SourceGlyph
              source={t.source === "github" ? "git" : t.source}
              size={12}
            />
            <span className="font-mono font-semibold text-[10px] text-muted-foreground">
              {t.ext_id}
            </span>
          </span>
        ))}
      </div>
      )}
      <span className="line-clamp-2 block text-[13px] font-medium leading-[1.35] text-foreground">
        {card.title}
      </span>
    </button>
  );
}
