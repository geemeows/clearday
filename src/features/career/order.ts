// Pure ordering helpers for the Career tree (competency / criterion /
// indicator / evidence). Mirrors features/projects/order.ts but constrained
// to within-parent reorder — cross-parent moves are out of scope for this
// slice.
//
// Positions are dense integers spaced by STEP so the wheel / Sheets export
// surfaces can reuse the same scheme that seedSampleTemplate writes
// (i * 1024). When the move would produce the same id-order as the input,
// the original array is returned by reference so the caller writes nothing
// — keeps DnD drops on the current slot a no-op.

export type Orderable = { id: string; position: number };

export const POSITION_STEP = 1024;

// Reorder items within the same parent. afterId=null inserts at position 0
// (top); a non-null afterId inserts the moved item directly after that id.
// Unknown afterId falls back to inserting at the end.
//
// Returns items with new dense positions (i * POSITION_STEP). When the
// resulting id-order matches the input id-order (sorted by position), the
// original array is returned by reference — no churn, no writes needed.
export function reorderWithinParent<T extends Orderable>(
  items: T[],
  movedId: string,
  afterId: string | null,
): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const moved = sorted.find((c) => c.id === movedId);
  if (!moved) return items;

  const rest = sorted.filter((c) => c.id !== movedId);
  const insertAt =
    afterId === null
      ? 0
      : (() => {
          const idx = rest.findIndex((c) => c.id === afterId);
          return idx === -1 ? rest.length : idx + 1;
        })();

  const reordered = [
    ...rest.slice(0, insertAt),
    moved,
    ...rest.slice(insertAt),
  ];

  // No-churn check: same id-order as the (sorted) input means no positions
  // changed semantically — return the original array so callers can skip
  // the optimistic patch + write entirely.
  const sameOrder = reordered.every((it, i) => sorted[i]?.id === it.id);
  if (sameOrder) return items;

  return reordered.map((it, i) => ({ ...it, position: i * POSITION_STEP }));
}
