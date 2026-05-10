// Pure ordering helpers for project columns and cards.
// All functions return new arrays with dense integer `order` values (0, 1, 2, …).
// They never mutate inputs and carry no Supabase dependency — easy to unit-test
// and reused by drag-and-drop, keyboard moves, and column management.

export type Orderable = { id: string; order: number };

export type OrderableCard = Orderable & { column_id: string };

// Reorder a card within its current column.
// afterId=null moves the card to position 0 (top of column).
// Returns all cards in the column with dense order values.
export function reorderWithinColumn(
  cards: OrderableCard[],
  movedId: string,
  afterId: string | null,
): OrderableCard[] {
  const sorted = [...cards].sort((a, b) => a.order - b.order);
  const moved = sorted.find((c) => c.id === movedId);
  if (!moved) return cards;

  const rest = sorted.filter((c) => c.id !== movedId);
  const insertAt =
    afterId === null
      ? 0
      : (() => {
          const idx = rest.findIndex((c) => c.id === afterId);
          return idx === -1 ? rest.length : idx + 1;
        })();

  return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)].map(
    (c, i) => ({ ...c, order: i }),
  );
}

// Move a card to a different column, inserting it after afterId (null = top).
// Returns all affected cards (source column + destination column) with dense
// order values. Cards in other columns are returned unchanged.
export function moveBetweenColumns(
  allCards: OrderableCard[],
  movedId: string,
  toColumnId: string,
  afterId: string | null,
): OrderableCard[] {
  const moved = allCards.find((c) => c.id === movedId);
  if (!moved) return allCards;

  const fromColumnId = moved.column_id;

  // Source column: remove moved card and re-dense.
  const sourceCards = allCards
    .filter((c) => c.column_id === fromColumnId && c.id !== movedId)
    .sort((a, b) => a.order - b.order)
    .map((c, i) => ({ ...c, order: i }));

  // Destination column: insert moved card (with updated column_id).
  const destExisting = allCards
    .filter((c) => c.column_id === toColumnId)
    .sort((a, b) => a.order - b.order);

  const insertAt =
    afterId === null
      ? 0
      : (() => {
          const idx = destExisting.findIndex((c) => c.id === afterId);
          return idx === -1 ? destExisting.length : idx + 1;
        })();

  const destCards = [
    ...destExisting.slice(0, insertAt),
    { ...moved, column_id: toColumnId },
    ...destExisting.slice(insertAt),
  ].map((c, i) => ({ ...c, order: i }));

  const otherCards = allCards.filter(
    (c) => c.column_id !== fromColumnId && c.column_id !== toColumnId,
  );

  return [...sourceCards, ...destCards, ...otherCards];
}

// Reorder columns within a project.
// afterId=null moves the column to position 0 (leftmost).
// Returns all columns with dense order values.
export function reorderColumns(
  columns: Orderable[],
  movedId: string,
  afterId: string | null,
): Orderable[] {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const moved = sorted.find((c) => c.id === movedId);
  if (!moved) return columns;

  const rest = sorted.filter((c) => c.id !== movedId);
  const insertAt =
    afterId === null
      ? 0
      : (() => {
          const idx = rest.findIndex((c) => c.id === afterId);
          return idx === -1 ? rest.length : idx + 1;
        })();

  return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)].map(
    (c, i) => ({ ...c, order: i }),
  );
}
