// Tests for diff-selection pure state machine.

import { describe, expect, it } from "vitest";
import {
  applyEvent,
  clearSelection,
  initialState,
  isLineSelected,
  type DiffSelectionState,
} from "./diff-selection";

function down(index: number): DiffSelectionState {
  return applyEvent(initialState(), { type: "down", line: { index, side: "RIGHT" } });
}

describe("applyEvent — pointer down", () => {
  it("sets live selection to a single-line range", () => {
    const s = down(5);
    expect(s.live).toEqual({ startIndex: 5, endIndex: 5, side: "RIGHT" });
    expect(s.committed).toBeNull();
    expect(s.dragging?.index).toBe(5);
  });
});

describe("applyEvent — pointer move", () => {
  it("extends selection forward", () => {
    let s = down(3);
    s = applyEvent(s, { type: "move", line: { index: 7, side: "RIGHT" } });
    expect(s.live).toEqual({ startIndex: 3, endIndex: 7, side: "RIGHT" });
  });

  it("handles reverse drag (end < start) by normalising range", () => {
    let s = down(10);
    s = applyEvent(s, { type: "move", line: { index: 4, side: "RIGHT" } });
    expect(s.live).toEqual({ startIndex: 4, endIndex: 10, side: "RIGHT" });
  });

  it("ignores move events when no drag is in progress", () => {
    const s = applyEvent(initialState(), {
      type: "move",
      line: { index: 3, side: "RIGHT" },
    });
    expect(s.live).toBeNull();
    expect(s.dragging).toBeNull();
  });

  it("locks to the starting side on cross-side drag", () => {
    let s = applyEvent(initialState(), {
      type: "down",
      line: { index: 2, side: "LEFT" },
    });
    s = applyEvent(s, { type: "move", line: { index: 8, side: "RIGHT" } });
    expect(s.live?.side).toBe("LEFT");
    expect(s.live?.startIndex).toBe(2);
    expect(s.live?.endIndex).toBe(8);
  });
});

describe("applyEvent — pointer up", () => {
  it("commits the selection on release", () => {
    let s = down(1);
    s = applyEvent(s, { type: "move", line: { index: 5, side: "RIGHT" } });
    s = applyEvent(s, { type: "up" });
    expect(s.committed).toEqual({ startIndex: 1, endIndex: 5, side: "RIGHT" });
    expect(s.dragging).toBeNull();
  });

  it("click without drag commits a single-line selection", () => {
    let s = down(4);
    s = applyEvent(s, { type: "up" });
    expect(s.committed).toEqual({ startIndex: 4, endIndex: 4, side: "RIGHT" });
  });

  it("up without prior down is a no-op", () => {
    const s = applyEvent(initialState(), { type: "up" });
    expect(s.committed).toBeNull();
    expect(s.live).toBeNull();
  });
});

describe("clearSelection", () => {
  it("resets everything to null", () => {
    let s = down(3);
    s = applyEvent(s, { type: "up" });
    s = clearSelection(s);
    expect(s.committed).toBeNull();
    expect(s.live).toBeNull();
    expect(s.dragging).toBeNull();
  });
});

describe("isLineSelected", () => {
  it("returns true for lines within live selection", () => {
    const s = down(2);
    expect(isLineSelected(s, 2)).toBe(true);
  });

  it("returns true for lines within committed selection", () => {
    let s = down(2);
    s = applyEvent(s, { type: "move", line: { index: 5, side: "RIGHT" } });
    s = applyEvent(s, { type: "up" });
    expect(isLineSelected(s, 3)).toBe(true);
    expect(isLineSelected(s, 5)).toBe(true);
  });

  it("returns false for lines outside selection", () => {
    let s = down(2);
    s = applyEvent(s, { type: "move", line: { index: 5, side: "RIGHT" } });
    s = applyEvent(s, { type: "up" });
    expect(isLineSelected(s, 6)).toBe(false);
    expect(isLineSelected(s, 1)).toBe(false);
  });

  it("returns false when no selection exists", () => {
    expect(isLineSelected(initialState(), 0)).toBe(false);
  });
});
