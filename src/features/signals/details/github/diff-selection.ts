// Pure pointer-event logic for line-range selection in a diff viewer.
// No DOM dependencies — the UI layer translates raw pointer events into the
// DiffPointerEvent shape and calls these functions; tests drive it without a
// browser.

export type DiffSide = "LEFT" | "RIGHT";

export type DiffLineRef = {
  /** Zero-based index into the rendered line list (not the original file line number). */
  index: number;
  side: DiffSide;
};

export type DiffPointerEvent =
  | { type: "down"; line: DiffLineRef }
  | { type: "move"; line: DiffLineRef }
  | { type: "up" };

export type DiffSelection = {
  startIndex: number;
  endIndex: number;
  side: DiffSide;
} | null;

export type DiffSelectionState = {
  /** Active during drag; null when no drag is in progress. */
  dragging: DiffLineRef | null;
  /** Current selection after pointer-up; null if nothing selected. */
  committed: DiffSelection;
  /** Live selection while dragging (may extend beyond committed). */
  live: DiffSelection;
};

export function initialState(): DiffSelectionState {
  return { dragging: null, committed: null, live: null };
}

/**
 * Pure state-machine reducer. Feed each pointer event through this function
 * to get the next state.
 */
export function applyEvent(
  state: DiffSelectionState,
  event: DiffPointerEvent,
): DiffSelectionState {
  switch (event.type) {
    case "down": {
      const live: DiffSelection = {
        startIndex: event.line.index,
        endIndex: event.line.index,
        side: event.line.side,
      };
      return { dragging: event.line, committed: null, live };
    }
    case "move": {
      if (!state.dragging) return state;
      // Cross-side drags lock to the side where the drag started.
      const side = state.dragging.side;
      const start = state.dragging.index;
      const end = event.line.index;
      const live: DiffSelection = {
        startIndex: Math.min(start, end),
        endIndex: Math.max(start, end),
        side,
      };
      return { ...state, live };
    }
    case "up": {
      if (!state.dragging) return state;
      return { dragging: null, committed: state.live, live: state.live };
    }
  }
}

/** Clears the committed selection (e.g. after comment is submitted). */
export function clearSelection(
  _state: DiffSelectionState,
): DiffSelectionState {
  return { dragging: null, committed: null, live: null };
}

/**
 * Returns true when the given line index is within the live or committed
 * selection (for styling highlighted rows).
 */
export function isLineSelected(
  state: DiffSelectionState,
  index: number,
): boolean {
  const sel = state.live ?? state.committed;
  if (!sel) return false;
  return index >= sel.startIndex && index <= sel.endIndex;
}
