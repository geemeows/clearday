import { createFileRoute } from "@tanstack/react-router";
import { Calendar, Plus } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { CardDetailPane } from "#/features/projects/CardDetailPane";
import {
  moveBetweenColumns,
  reorderWithinColumn,
  type OrderableCard,
} from "#/features/projects/order";
import {
  type CardPatch,
  createCard,
  deleteCard,
  listCards,
  listColumns,
  listProjects,
  type StoredCard,
  type StoredColumn,
  type StoredProject,
  updateCard,
} from "#/features/projects/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectBoardPage,
});

function ProjectBoardPage() {
  const { projectId } = Route.useParams();
  const client = supabase as unknown as SupabaseLike;

  const [project, setProject] = useState<StoredProject | null>(null);
  const [columns, setColumns] = useState<StoredColumn[]>([]);
  const [cards, setCards] = useState<StoredCard[]>([]);
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
      .then(([projects, cols, cds]) => {
        if (cancelled) return;
        const found = projects.find((p) => p.id === projectId) ?? null;
        setProject(found);
        setColumns(cols);
        setCards(cds);
        setLoading(false);
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

  return (
    <ProjectBoardView
      project={project}
      columns={columns}
      cards={cards}
      loading={loading}
      error={error}
      onAddCard={handleAddCard}
      onUpdateCard={handleUpdateCard}
      onDeleteCard={handleDeleteCard}
      onMoveCard={handleMoveCard}
    />
  );
}

export function ProjectBoardView({
  project,
  columns,
  cards,
  loading,
  error,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
}: {
  project: StoredProject | null;
  columns: StoredColumn[];
  cards: StoredCard[];
  loading: boolean;
  error: string | null;
  onAddCard: (columnId: string, title: string) => void;
  onUpdateCard?: (cardId: string, patch: CardPatch) => void;
  onDeleteCard?: (cardId: string) => void;
  onMoveCard?: (
    cardId: string,
    toColumnId: string,
    afterId: string | null,
  ) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = selectedCardId
    ? (cards.find((c) => c.id === selectedCardId) ?? null)
    : null;

  // Shared ref for tracking the card currently being dragged (avoids
  // dataTransfer serialization in tests and removes a round-trip through the
  // browser clipboard security boundary).
  const dragCardIdRef = useRef<string | null>(null);

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-baseline gap-x-3 border-b border-border px-6 py-4">
        <h1 className="font-semibold text-xl text-foreground tracking-tight">
          {project?.name ?? "Project"}
        </h1>
        <span className="font-mono text-muted-foreground text-xs">
          {cards.length} cards
        </span>
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
        <p
          aria-busy="true"
          className="px-6 pt-4 text-muted-foreground text-sm"
        >
          Loading…
        </p>
      )}

      {!loading && (
        <div className="flex flex-1 gap-4 overflow-x-auto px-6 py-4">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              cards={cards.filter((c) => c.column_id === col.id)}
              allColumns={columns}
              allCards={cards}
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
          onChange={(patch) => onUpdateCard?.(selectedCard.id, patch)}
          onDelete={() => {
            onDeleteCard?.(selectedCard.id);
            setSelectedCardId(null);
          }}
          onClose={() => setSelectedCardId(null)}
        />
      )}
    </section>
  );
}

function KanbanColumn({
  column,
  cards,
  allColumns,
  allCards,
  onAddCard,
  onSelectCard,
  onMoveCard,
  dragCardIdRef,
}: {
  column: StoredColumn;
  cards: StoredCard[];
  allColumns: StoredColumn[];
  allCards: StoredCard[];
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

  const wipOver =
    column.wip_limit != null && cards.length > column.wip_limit;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
      targetCards.length > 0
        ? targetCards[targetCards.length - 1].id
        : null;
    onMoveCard?.(cardId, targetCol.id, afterId);
  };

  return (
    <article
      aria-label={column.name}
      className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-card"
      onDragOver={(e) => {
        e.preventDefault();
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
              onClick={() => onSelectCard(card.id)}
              onDragStart={() => {
                dragCardIdRef.current = card.id;
                setDropTargetId(undefined);
              }}
              onKeyboardMove={(dir) => handleKeyboardMove(card.id, dir)}
            />
          </li>
        ))}

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

function CardChip({
  card,
  onClick,
  onDragStart,
  onKeyboardMove,
}: {
  card: StoredCard;
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
      className="w-full cursor-grab rounded-md border border-border bg-background px-3 py-2 text-left text-sm shadow-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
    >
      <span className="line-clamp-2 text-foreground">{card.title}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {card.priority && (
          <span
            data-priority={card.priority}
            className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground"
          >
            {card.priority}
          </span>
        )}
        {card.due_at && (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            {card.due_at.slice(0, 10)}
          </span>
        )}
      </div>
    </button>
  );
}
