import { describe, expect, it } from "vitest";
import {
  dueRollupPeriods,
  nextPeriodStart,
  type RawSignalForRollup,
  type RollupDeps,
  type RollupRow,
  rollup,
  runDueRollups,
} from "#/lib/signal-rollup";

function makeDeps(initial: {
  raw?: RawSignalForRollup[];
  monthRollups?: RollupRow[];
  now?: Date;
}): {
  deps: RollupDeps;
  raw: RawSignalForRollup[];
  rollups: RollupRow[];
} {
  const raw = [...(initial.raw ?? [])];
  const rollups: RollupRow[] = [
    ...(initial.monthRollups ?? []).map((r) => ({
      ...r,
      stats: { ...r.stats },
    })),
  ];
  const deps: RollupDeps = {
    loadRawInRange: async (s, e) =>
      raw.filter((r) => r.created_at >= s && r.created_at < e),
    loadMonthRollupsInRange: async (s, e) =>
      rollups.filter(
        (r) =>
          r.period === "month" && r.period_start >= s && r.period_start < e,
      ),
    upsertRollup: async (row) => {
      const idx = rollups.findIndex(
        (r) =>
          r.period === row.period &&
          r.period_start === row.period_start &&
          r.kind === row.kind,
      );
      if (idx >= 0) rollups[idx] = { ...row, stats: { ...row.stats } };
      else rollups.push({ ...row, stats: { ...row.stats } });
    },
    deleteRawInRange: async (s, e) => {
      const before = raw.length;
      for (let i = raw.length - 1; i >= 0; i--) {
        const r = raw[i];
        if (r.created_at >= s && r.created_at < e) raw.splice(i, 1);
      }
      return before - raw.length;
    },
    now: initial.now ? () => initial.now ?? new Date() : undefined,
  };
  return { deps, raw, rollups };
}

describe("rollup (monthly)", () => {
  it("aggregates raw signals by kind and deletes them", async () => {
    const raw: RawSignalForRollup[] = [
      {
        kind: "pr_review_requested",
        created_at: "2026-02-05T10:00:00Z",
        dismissed_at: "2026-02-06T10:00:00Z",
        requires_action: true,
      },
      {
        kind: "pr_review_requested",
        created_at: "2026-02-12T10:00:00Z",
        dismissed_at: null,
        requires_action: true,
      },
      {
        kind: "mention",
        created_at: "2026-02-20T10:00:00Z",
        dismissed_at: "2026-02-21T10:00:00Z",
        requires_action: true,
      },
      {
        // Outside the window — must NOT be touched.
        kind: "mention",
        created_at: "2026-03-01T00:00:00Z",
        dismissed_at: null,
        requires_action: true,
      },
    ];
    const { deps, raw: rawRef, rollups } = makeDeps({ raw });
    const r = await rollup(
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 1, 1)) },
      deps,
    );

    expect(r.rolledKinds).toBe(2);
    expect(r.rawDeleted).toBe(3);
    expect(rawRef).toHaveLength(1);
    expect(rawRef[0].created_at).toBe("2026-03-01T00:00:00Z");

    const pr = rollups.find((x) => x.kind === "pr_review_requested");
    expect(pr).toMatchObject({
      period: "month",
      period_start: "2026-02-01",
      count: 2,
      stats: { dismissed: 1, requires_action: 2 },
    });
    const mention = rollups.find((x) => x.kind === "mention");
    expect(mention).toMatchObject({
      count: 1,
      stats: { dismissed: 1, requires_action: 1 },
    });
  });

  it("is idempotent on re-run after raw deletion", async () => {
    const raw: RawSignalForRollup[] = [
      {
        kind: "dm",
        created_at: "2026-02-10T10:00:00Z",
        dismissed_at: null,
        requires_action: true,
      },
    ];
    const { deps, rollups } = makeDeps({ raw });
    await rollup(
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 1, 1)) },
      deps,
    );
    expect(rollups).toHaveLength(1);
    const second = await rollup(
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 1, 1)) },
      deps,
    );
    // Second pass: raw is gone → no new aggregation → no upsert → no delete.
    expect(second.rolledKinds).toBe(0);
    expect(second.rawDeleted).toBe(0);
    expect(rollups).toHaveLength(1);
    expect(rollups[0].count).toBe(1);
  });

  it("noop when the period has no raw signals", async () => {
    const { deps, rollups } = makeDeps({ raw: [] });
    const r = await rollup(
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 0, 1)) },
      deps,
    );
    expect(r.rolledKinds).toBe(0);
    expect(r.rawDeleted).toBe(0);
    expect(rollups).toHaveLength(0);
  });

  it("re-running after settings change re-writes the rollup row", async () => {
    const raw: RawSignalForRollup[] = [
      {
        kind: "mention",
        created_at: "2026-02-10T10:00:00Z",
        dismissed_at: null,
        requires_action: false,
      },
    ];
    const { deps, rollups } = makeDeps({
      raw,
      monthRollups: [
        {
          period: "month",
          period_start: "2026-02-01",
          kind: "mention",
          count: 999,
          stats: { dismissed: 0, requires_action: 0 },
        },
      ],
    });
    await rollup(
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 1, 1)) },
      deps,
    );
    const rolled = rollups.find((r) => r.kind === "mention");
    expect(rolled?.count).toBe(1);
  });
});

describe("rollup (quarter / year)", () => {
  it("aggregates from existing month rollups for a quarter", async () => {
    const monthRollups: RollupRow[] = [
      {
        period: "month",
        period_start: "2026-01-01",
        kind: "pr_review_requested",
        count: 4,
        stats: { dismissed: 3, requires_action: 4 },
      },
      {
        period: "month",
        period_start: "2026-02-01",
        kind: "pr_review_requested",
        count: 5,
        stats: { dismissed: 2, requires_action: 5 },
      },
      {
        period: "month",
        period_start: "2026-03-01",
        kind: "mention",
        count: 2,
        stats: { dismissed: 1, requires_action: 2 },
      },
      {
        // outside Q1 — must not bleed into the Q1 aggregate
        period: "month",
        period_start: "2026-04-01",
        kind: "mention",
        count: 100,
        stats: { dismissed: 0, requires_action: 0 },
      },
    ];
    const { deps, rollups } = makeDeps({ monthRollups });
    const r = await rollup(
      { periodKind: "quarter", periodStart: new Date(Date.UTC(2026, 0, 1)) },
      deps,
    );
    expect(r.rolledKinds).toBe(2);
    expect(r.rawDeleted).toBe(0); // quarter never deletes raw
    const q = rollups.find(
      (x) => x.period === "quarter" && x.kind === "pr_review_requested",
    );
    expect(q).toMatchObject({
      period: "quarter",
      period_start: "2026-01-01",
      count: 9,
      stats: { dismissed: 5, requires_action: 9 },
    });
    const qm = rollups.find(
      (x) => x.period === "quarter" && x.kind === "mention",
    );
    expect(qm?.count).toBe(2);
  });

  it("aggregates from month rollups across the year", async () => {
    const monthRollups: RollupRow[] = Array.from({ length: 12 }, (_, i) => ({
      period: "month" as const,
      period_start: `2025-${String(i + 1).padStart(2, "0")}-01`,
      kind: "dm",
      count: 1,
      stats: { dismissed: 1, requires_action: 1 },
    }));
    const { deps, rollups } = makeDeps({ monthRollups });
    await rollup(
      { periodKind: "year", periodStart: new Date(Date.UTC(2025, 0, 1)) },
      deps,
    );
    const y = rollups.find((x) => x.period === "year");
    expect(y).toMatchObject({
      period_start: "2025-01-01",
      kind: "dm",
      count: 12,
      stats: { dismissed: 12, requires_action: 12 },
    });
  });
});

describe("dueRollupPeriods", () => {
  it("returns the latest month/quarter/year whose end ≤ now-90d", () => {
    // 2026-05-04 minus 90d = 2026-02-03. Cutoff month = Feb.
    // Latest month period whose end ≤ Feb 3 = January.
    // Latest quarter ≤ Feb 3 = none of 2026 (Q1 ends 4/1) → Q4 2025.
    // Latest year ≤ Feb 3 = 2024 (year 2025 ends 1/1/2026 ≤ 2/3/2026 ✓).
    const now = new Date(Date.UTC(2026, 4, 4));
    const periods = dueRollupPeriods(now);
    expect(periods).toEqual([
      { periodKind: "month", periodStart: new Date(Date.UTC(2026, 0, 1)) },
      { periodKind: "quarter", periodStart: new Date(Date.UTC(2025, 9, 1)) },
      { periodKind: "year", periodStart: new Date(Date.UTC(2025, 0, 1)) },
    ]);
  });

  it("honors a custom retentionDays override (shorter cutoff)", () => {
    // now = 2026-05-04, retention=30 → cutoff = 2026-04-04.
    // Latest month period whose end ≤ Apr 4 = March (ends 4/1).
    const now = new Date(Date.UTC(2026, 4, 4));
    const periods = dueRollupPeriods(now, 30);
    expect(periods[0]).toEqual({
      periodKind: "month",
      periodStart: new Date(Date.UTC(2026, 2, 1)),
    });
  });

  it("honors a custom retentionDays override (longer cutoff)", () => {
    // now = 2026-05-04, retention=180 → cutoff = 2025-11-05.
    // Latest month period whose end ≤ Nov 5 = October (ends 11/1).
    const now = new Date(Date.UTC(2026, 4, 4));
    const periods = dueRollupPeriods(now, 180);
    expect(periods[0]).toEqual({
      periodKind: "month",
      periodStart: new Date(Date.UTC(2025, 9, 1)),
    });
  });

  it("handles year boundary", () => {
    // now = 2026-01-15, cutoff = 2025-10-17. Latest month ≤ Sep (ends 10/1),
    // latest quarter = Q3 (ends 10/1 ≤ 10/17), latest year = 2024.
    const now = new Date(Date.UTC(2026, 0, 15));
    const periods = dueRollupPeriods(now);
    expect(periods[0].periodStart).toEqual(new Date(Date.UTC(2025, 8, 1)));
    expect(periods[1].periodStart).toEqual(new Date(Date.UTC(2025, 6, 1)));
    expect(periods[2].periodStart).toEqual(new Date(Date.UTC(2024, 0, 1)));
  });
});

describe("nextPeriodStart", () => {
  it("month wraps year-end", () => {
    expect(nextPeriodStart("month", new Date(Date.UTC(2026, 11, 1)))).toEqual(
      new Date(Date.UTC(2027, 0, 1)),
    );
  });
  it("quarter spans 3 months", () => {
    expect(nextPeriodStart("quarter", new Date(Date.UTC(2026, 9, 1)))).toEqual(
      new Date(Date.UTC(2027, 0, 1)),
    );
  });
  it("year handles leap year correctly (just calendar steps)", () => {
    // Year period [2024-01-01, 2025-01-01) — leap year is 366 days; we don't
    // rely on day count, just on next-year boundary.
    expect(nextPeriodStart("year", new Date(Date.UTC(2024, 0, 1)))).toEqual(
      new Date(Date.UTC(2025, 0, 1)),
    );
  });
});

describe("runDueRollups", () => {
  it("runs all three kinds (month rolls raw + deletes, quarter/year derive)", async () => {
    const now = new Date(Date.UTC(2026, 4, 4));
    const raw: RawSignalForRollup[] = [
      {
        kind: "mention",
        created_at: "2026-01-10T10:00:00Z",
        dismissed_at: null,
        requires_action: true,
      },
    ];
    const monthRollups: RollupRow[] = [
      // Pre-existing for Q4 2025 / 2025 derived rolls
      {
        period: "month",
        period_start: "2025-10-01",
        kind: "mention",
        count: 3,
        stats: { dismissed: 1, requires_action: 3 },
      },
      {
        period: "month",
        period_start: "2025-11-01",
        kind: "mention",
        count: 2,
        stats: { dismissed: 0, requires_action: 2 },
      },
      {
        period: "month",
        period_start: "2025-12-01",
        kind: "mention",
        count: 1,
        stats: { dismissed: 1, requires_action: 1 },
      },
    ];
    const {
      deps,
      raw: rawRef,
      rollups,
    } = makeDeps({
      raw,
      monthRollups,
      now,
    });
    const reports = await runDueRollups(deps);

    expect(reports).toHaveLength(3);
    expect(reports[0].period).toBe("month");
    expect(reports[0].rawDeleted).toBe(1);
    expect(rawRef).toHaveLength(0);

    // Quarter Q4 2025 mention = 3+2+1 = 6
    const q = rollups.find(
      (r) => r.period === "quarter" && r.period_start === "2025-10-01",
    );
    expect(q?.count).toBe(6);
    // Year 2025: only the three rollups we seeded fall in 2025 (the
    // newly-created January rollup is for 2026 and outside 2025).
    const y = rollups.find(
      (r) => r.period === "year" && r.period_start === "2025-01-01",
    );
    expect(y?.count).toBe(6);
  });

  it("a shorter retentionDays rolls a more recent month", async () => {
    // now = 2026-05-04. retention=30 → cutoff = 2026-04-04 → roll March.
    const now = new Date(Date.UTC(2026, 4, 4));
    const raw: RawSignalForRollup[] = [
      {
        kind: "mention",
        created_at: "2026-03-15T10:00:00Z",
        dismissed_at: null,
        requires_action: true,
      },
    ];
    const { deps, rollups } = makeDeps({ raw, now });
    await runDueRollups(deps, 30);
    const m = rollups.find(
      (r) => r.period === "month" && r.period_start === "2026-03-01",
    );
    expect(m?.count).toBe(1);
  });
});
