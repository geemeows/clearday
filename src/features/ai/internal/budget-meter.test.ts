import { describe, expect, it, vi } from "vitest";
import {
  computeCost,
  decideModel,
  monthlySpend,
  recordUsage,
} from "#/features/ai/internal/budget-meter";

describe("decideModel", () => {
  const base = {
    requested: "gpt-4o",
    fallback: "gpt-4o-mini",
    monthBudget: 25,
  };

  it("returns requested model when below 80% of budget", () => {
    const d = decideModel({ ...base, monthSpent: 19.99 });
    expect(d).toEqual({
      model: "gpt-4o",
      usedFallback: false,
      refused: false,
      ratio: 19.99 / 25,
    });
  });

  it("switches to fallback at exactly 80% of budget", () => {
    const d = decideModel({ ...base, monthSpent: 20 });
    expect(d.model).toBe("gpt-4o-mini");
    expect(d.usedFallback).toBe(true);
    expect(d.refused).toBe(false);
  });

  it("stays on requested at 80% if no fallback configured", () => {
    const d = decideModel({ ...base, fallback: null, monthSpent: 22 });
    expect(d.model).toBe("gpt-4o");
    expect(d.usedFallback).toBe(false);
    expect(d.refused).toBe(false);
  });

  it("refuses at exactly 100% of budget", () => {
    const d = decideModel({ ...base, monthSpent: 25 });
    expect(d.refused).toBe(true);
  });

  it("refuses past 100% of budget", () => {
    const d = decideModel({ ...base, monthSpent: 50 });
    expect(d.refused).toBe(true);
  });

  it("never refuses or falls back when no budget is configured", () => {
    const d = decideModel({ ...base, monthBudget: 0, monthSpent: 9999 });
    expect(d).toEqual({
      model: "gpt-4o",
      usedFallback: false,
      refused: false,
      ratio: 0,
    });
  });
});

describe("computeCost", () => {
  it("computes cost for a known model from per-million rates", () => {
    // gpt-4o-mini = 0.15 input / 0.6 output per 1M.
    // 1M input + 1M output → 0.75 USD; 4dp rounding preserved.
    expect(computeCost("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(
      0.75,
      4,
    );
  });

  it("returns 0 for an unknown model", () => {
    expect(computeCost("local-fancy-model", 9999, 9999)).toBe(0);
  });
});

describe("recordUsage / monthlySpend", () => {
  it("recordUsage inserts a row with computed cost when costUsd omitted", async () => {
    const inserts: unknown[] = [];
    const store = {
      from: () => ({
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    };
    await recordUsage(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        now: new Date("2026-05-04T10:00:00Z"),
      },
      store,
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      day: "2026-05-04",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    });
    expect((inserts[0] as { cost_usd: number }).cost_usd).toBeCloseTo(0.75, 4);
  });

  it("recordUsage uses the explicit costUsd when provided", async () => {
    const inserts: unknown[] = [];
    const store = {
      from: () => ({
        insert: async (row: unknown) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    };
    await recordUsage(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        promptTokens: 100,
        completionTokens: 50,
        costUsd: 9.99,
      },
      store,
    );
    expect((inserts[0] as { cost_usd: number }).cost_usd).toBe(9.99);
  });

  it("monthlySpend sums cost_usd over the calendar month containing `now`", async () => {
    const select = vi.fn();
    const gte = vi.fn();
    const lt = vi.fn();
    const store = {
      from: () => ({
        select: (...args: unknown[]) => {
          select(...args);
          return {
            gte: (...gargs: unknown[]) => {
              gte(...gargs);
              return {
                lt: async (...largs: unknown[]) => {
                  lt(...largs);
                  return {
                    data: [
                      { cost_usd: "1.50" },
                      { cost_usd: 0.25 },
                      { cost_usd: null },
                    ],
                    error: null,
                  };
                },
              };
            },
          };
        },
      }),
    };
    const total = await monthlySpend(store, new Date("2026-05-04T10:00:00Z"));
    expect(total).toBeCloseTo(1.75, 4);
    expect(gte).toHaveBeenCalledWith("day", "2026-05-01");
    expect(lt).toHaveBeenCalledWith("day", "2026-06-01");
  });

  it("monthlySpend returns 0 on an empty result set", async () => {
    const store = {
      from: () => ({
        select: () => ({
          gte: () => ({
            lt: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };
    expect(await monthlySpend(store, new Date("2026-05-04Z"))).toBe(0);
  });
});
