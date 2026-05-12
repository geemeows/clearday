import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEEK_START,
  getWeekStart,
  putWeekStart,
  type WeekStartStore,
  type WeekStartView,
} from "#/features/settings/week-start/api";

function makeStore(
  initial: WeekStartView = DEFAULT_WEEK_START,
): WeekStartStore {
  let row: WeekStartView = { ...initial };
  return {
    load: vi.fn(async () => ({ ...row })),
    save: vi.fn(async (patch) => {
      row = { ...row, ...patch };
      return { ...row };
    }),
  };
}

describe("getWeekStart", () => {
  it("returns the stored view", async () => {
    const store = makeStore({ weekStart: "sun" });
    expect(await getWeekStart(store)).toEqual({ weekStart: "sun" });
  });

  it("returns the default when no row has been written", async () => {
    const store = makeStore();
    expect(await getWeekStart(store)).toEqual({ weekStart: "mon" });
  });
});

describe("putWeekStart", () => {
  it("round-trips sun → sun", async () => {
    const store = makeStore();
    const out = await putWeekStart({ weekStart: "sun" }, store);
    expect(out).toEqual({ ok: true, weekStart: { weekStart: "sun" } });
    expect(await getWeekStart(store)).toEqual({ weekStart: "sun" });
  });

  it("accepts 'sat'", async () => {
    const store = makeStore();
    const out = await putWeekStart({ weekStart: "sat" }, store);
    expect(out).toEqual({ ok: true, weekStart: { weekStart: "sat" } });
  });

  it("rejects unknown values", async () => {
    const store = makeStore();
    const out = await putWeekStart({ weekStart: "friday" }, store);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/weekStart must be one of/);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects non-string values", async () => {
    const store = makeStore();
    const out = await putWeekStart(
      { weekStart: 1 as unknown as string },
      store,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("weekStart must be a string");
  });

  it("is a no-op read when weekStart is omitted", async () => {
    const store = makeStore({ weekStart: "sat" });
    const out = await putWeekStart({}, store);
    expect(out).toEqual({ ok: true, weekStart: { weekStart: "sat" } });
    expect(store.save).not.toHaveBeenCalled();
  });
});
