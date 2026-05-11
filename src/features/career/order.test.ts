import { describe, expect, it } from "vitest";
import { POSITION_STEP, reorderWithinParent } from "#/features/career/order";

type Item = { id: string; position: number };

function it_(id: string, position: number): Item {
  return { id, position };
}

describe("reorderWithinParent", () => {
  it("moves an item to the top when afterId is null", () => {
    const items = [it_("a", 0), it_("b", 1024), it_("c", 2048)];
    const result = reorderWithinParent(items, "c", null);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(result.map((x) => x.position)).toEqual([
      0,
      POSITION_STEP,
      POSITION_STEP * 2,
    ]);
  });

  it("moves an item after a specific id", () => {
    const items = [it_("a", 0), it_("b", 1024), it_("c", 2048)];
    const result = reorderWithinParent(items, "a", "c");
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(result.map((x) => x.position)).toEqual([
      0,
      POSITION_STEP,
      POSITION_STEP * 2,
    ]);
  });

  it("inserts at the end when afterId is unknown", () => {
    const items = [it_("a", 0), it_("b", 1024), it_("c", 2048)];
    const result = reorderWithinParent(items, "a", "missing");
    expect(result.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("no-ops when movedId is not found", () => {
    const items = [it_("a", 0)];
    expect(reorderWithinParent(items, "z", null)).toBe(items);
  });

  it("returns the original array unchanged when nothing actually moved", () => {
    const items = [it_("a", 0), it_("b", 1024), it_("c", 2048)];
    // Moving "b" after "a" leaves the order ["a","b","c"] — same as input.
    expect(reorderWithinParent(items, "b", "a")).toBe(items);
    // Moving "a" to the top (already at top) — same as input.
    expect(reorderWithinParent(items, "a", null)).toBe(items);
  });

  it("sorts by position before reordering", () => {
    const items = [it_("c", 2048), it_("a", 0), it_("b", 1024)];
    const result = reorderWithinParent(items, "c", null);
    expect(result.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("produces dense positions from non-contiguous inputs", () => {
    const items = [it_("a", 0), it_("b", 5), it_("c", 99)];
    const result = reorderWithinParent(items, "c", null);
    expect(result.map((x) => x.position)).toEqual([
      0,
      POSITION_STEP,
      POSITION_STEP * 2,
    ]);
  });

  it("handles a single item (no-op)", () => {
    const items = [it_("a", 0)];
    const result = reorderWithinParent(items, "a", null);
    expect(result).toBe(items);
  });

  it("preserves extra fields on items via the generic", () => {
    type Named = Item & { name: string };
    const items: Named[] = [
      { id: "a", position: 0, name: "alpha" },
      { id: "b", position: 1024, name: "beta" },
    ];
    const result = reorderWithinParent(items, "b", null);
    expect(result.map((x) => x.name)).toEqual(["beta", "alpha"]);
  });
});
