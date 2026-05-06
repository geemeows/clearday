import { describe, expect, it } from "vitest";
import { detectConflicts } from "#/features/signals/views/calendar-conflicts";

const ev = (id: string, day: number, start: number, end: number) => ({
  id,
  day,
  start,
  end,
});

describe("detectConflicts", () => {
  it("returns [] when no events overlap", () => {
    const events = [ev("a", 0, 540, 600), ev("b", 0, 660, 720)];
    expect(detectConflicts(events)).toEqual([]);
  });

  it("returns [] for edge-touching events (a.end === b.start)", () => {
    const events = [ev("a", 0, 540, 600), ev("b", 0, 600, 660)];
    expect(detectConflicts(events)).toEqual([]);
  });

  it("returns one pair for a single overlap", () => {
    const a = ev("a", 0, 540, 660);
    const b = ev("b", 0, 600, 720);
    const pairs = detectConflicts([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("a");
    expect(pairs[0].b.id).toBe("b");
  });

  it("returns three pairs for a three-way overlap", () => {
    const a = ev("a", 0, 540, 720);
    const b = ev("b", 0, 600, 780);
    const c = ev("c", 0, 660, 840);
    const pairs = detectConflicts([a, b, c]);
    expect(pairs).toHaveLength(3);
    const ids = pairs.map((p) => `${p.a.id}-${p.b.id}`).sort();
    expect(ids).toEqual(["a-b", "a-c", "b-c"]);
  });

  it("never reports cross-day events as conflicts", () => {
    const events = [
      ev("a", 0, 540, 720),
      ev("b", 1, 540, 720),
      ev("c", 2, 540, 720),
    ];
    expect(detectConflicts(events)).toEqual([]);
  });
});
