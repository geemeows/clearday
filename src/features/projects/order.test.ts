import { describe, expect, it } from "vitest";
import {
  moveBetweenColumns,
  reorderColumns,
  reorderWithinColumn,
} from "#/features/projects/order";
import type { Orderable, OrderableCard } from "#/features/projects/order";

function col(id: string, order: number): Orderable {
  return { id, order };
}

function card(id: string, columnId: string, order: number): OrderableCard {
  return { id, column_id: columnId, order };
}

describe("reorderWithinColumn", () => {
  it("moves a card to the top when afterId is null", () => {
    const cards = [card("a", "c1", 0), card("b", "c1", 1), card("c", "c1", 2)];
    const result = reorderWithinColumn(cards, "c", null);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("moves a card after a specific card", () => {
    const cards = [card("a", "c1", 0), card("b", "c1", 1), card("c", "c1", 2)];
    const result = reorderWithinColumn(cards, "a", "c");
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("no-ops when movedId is not found", () => {
    const cards = [card("a", "c1", 0)];
    expect(reorderWithinColumn(cards, "z", null)).toBe(cards);
  });

  it("produces dense order starting from 0", () => {
    const cards = [
      card("a", "c1", 5),
      card("b", "c1", 10),
      card("c", "c1", 20),
    ];
    const result = reorderWithinColumn(cards, "b", null);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("handles a single card", () => {
    const cards = [card("a", "c1", 0)];
    const result = reorderWithinColumn(cards, "a", null);
    expect(result.map((x) => x.id)).toEqual(["a"]);
    expect(result.map((x) => x.order)).toEqual([0]);
  });
});

describe("moveBetweenColumns", () => {
  it("moves a card to the top of destination column", () => {
    const cards = [
      card("a", "c1", 0),
      card("b", "c1", 1),
      card("x", "c2", 0),
    ];
    const result = moveBetweenColumns(cards, "b", "c2", null);
    const c1 = result.filter((c) => c.column_id === "c1").sort((a, b) => a.order - b.order);
    const c2 = result.filter((c) => c.column_id === "c2").sort((a, b) => a.order - b.order);
    expect(c1.map((c) => c.id)).toEqual(["a"]);
    expect(c1.map((c) => c.order)).toEqual([0]);
    expect(c2.map((c) => c.id)).toEqual(["b", "x"]);
    expect(c2.map((c) => c.order)).toEqual([0, 1]);
  });

  it("inserts after a given card in the destination column", () => {
    const cards = [
      card("a", "c1", 0),
      card("x", "c2", 0),
      card("y", "c2", 1),
    ];
    const result = moveBetweenColumns(cards, "a", "c2", "x");
    const c2 = result.filter((c) => c.column_id === "c2").sort((a, b) => a.order - b.order);
    expect(c2.map((c) => c.id)).toEqual(["x", "a", "y"]);
    expect(c2.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it("leaves the source column densely ordered after removal", () => {
    const cards = [
      card("a", "c1", 0),
      card("b", "c1", 1),
      card("c", "c1", 2),
    ];
    const result = moveBetweenColumns(cards, "b", "c2", null);
    const c1 = result.filter((c) => c.column_id === "c1").sort((a, b) => a.order - b.order);
    expect(c1.map((c) => c.id)).toEqual(["a", "c"]);
    expect(c1.map((c) => c.order)).toEqual([0, 1]);
  });

  it("updates the moved card's column_id", () => {
    const cards = [card("a", "c1", 0)];
    const result = moveBetweenColumns(cards, "a", "c2", null);
    expect(result.find((c) => c.id === "a")?.column_id).toBe("c2");
  });

  it("no-ops when movedId is not found", () => {
    const cards = [card("a", "c1", 0)];
    expect(moveBetweenColumns(cards, "z", "c2", null)).toBe(cards);
  });
});

describe("reorderColumns", () => {
  it("moves a column to position 0 when afterId is null", () => {
    const cols = [col("a", 0), col("b", 1), col("c", 2)];
    const result = reorderColumns(cols, "c", null);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("moves a column after a specific column", () => {
    const cols = [col("a", 0), col("b", 1), col("c", 2)];
    const result = reorderColumns(cols, "a", "c");
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });

  it("no-ops when movedId is not found", () => {
    const cols = [col("a", 0)];
    expect(reorderColumns(cols, "z", null)).toBe(cols);
  });

  it("produces dense order from non-contiguous inputs", () => {
    const cols = [col("a", 0), col("b", 5), col("c", 99)];
    const result = reorderColumns(cols, "b", null);
    expect(result.map((x) => x.order)).toEqual([0, 1, 2]);
  });
});
