// Signal rollup. Compacts raw `signals` rows older than 90 days into one
// `signal_rollups` row per (period, kind) and deletes the underlying raw
// data. Pure module: callers inject the queries (load raw rows, upsert
// rollup, delete raw, load existing month rollups for derived quarter/year).
//
// Rollup ordering matters: month is the canonical rollup that *reads from
// raw* and deletes raw rows. Quarter/year aggregate from already-written
// month rollups so they don't depend on raw data still being present.
//
// Idempotent: upserts are keyed on (period, period_start, kind); a re-run
// after the raw rows have been deleted finds nothing to roll, writes nothing,
// and deletes nothing — the existing rollup row is left intact.

export type PeriodKind = "month" | "quarter" | "year";

export type RawSignalForRollup = {
  kind: string;
  created_at: string;
  dismissed_at: string | null;
  requires_action: boolean;
};

export type RollupRow = {
  period: PeriodKind;
  period_start: string; // YYYY-MM-DD
  kind: string;
  count: number;
  stats: Record<string, number>;
};

export type RollupDeps = {
  /** Raw signals with created_at in [startIso, endIso). */
  loadRawInRange: (
    startIso: string,
    endIso: string,
  ) => Promise<RawSignalForRollup[]>;
  /** Existing month rollups with period_start in [startDate, endDate). */
  loadMonthRollupsInRange: (
    startDate: string,
    endDate: string,
  ) => Promise<RollupRow[]>;
  /** Upsert by (period, period_start, kind). */
  upsertRollup: (row: RollupRow) => Promise<void>;
  /** Delete raw signals with created_at in [startIso, endIso). Returns count. */
  deleteRawInRange: (startIso: string, endIso: string) => Promise<number>;
  now?: () => Date;
};

export type RollupReport = {
  period: PeriodKind;
  periodStart: string;
  rolledKinds: number;
  rawDeleted: number;
};

export const HOT_RETENTION_DAYS = 90;

export async function rollup(
  args: { periodKind: PeriodKind; periodStart: Date },
  deps: RollupDeps,
): Promise<RollupReport> {
  const { periodKind, periodStart } = args;
  const periodEnd = nextPeriodStart(periodKind, periodStart);
  const startIso = periodStart.toISOString();
  const endIso = periodEnd.toISOString();
  const startDate = isoDate(periodStart);

  let stats: Map<string, KindStats>;
  if (periodKind === "month") {
    const rows = await deps.loadRawInRange(startIso, endIso);
    stats = aggregateRaw(rows);
  } else {
    const rows = await deps.loadMonthRollupsInRange(
      startDate,
      isoDate(periodEnd),
    );
    stats = aggregateMonthRollups(rows);
  }

  for (const [kind, s] of stats) {
    await deps.upsertRollup({
      period: periodKind,
      period_start: startDate,
      kind,
      count: s.count,
      stats: { dismissed: s.dismissed, requires_action: s.requires_action },
    });
  }

  let rawDeleted = 0;
  if (periodKind === "month" && stats.size > 0) {
    rawDeleted = await deps.deleteRawInRange(startIso, endIso);
  }
  return {
    period: periodKind,
    periodStart: startDate,
    rolledKinds: stats.size,
    rawDeleted,
  };
}

export function dueRollupPeriods(
  now: Date,
): Array<{ periodKind: PeriodKind; periodStart: Date }> {
  const cutoff = subDays(now, HOT_RETENTION_DAYS);
  return [
    { periodKind: "month", periodStart: lastMonthStartBefore(cutoff) },
    { periodKind: "quarter", periodStart: lastQuarterStartBefore(cutoff) },
    { periodKind: "year", periodStart: lastYearStartBefore(cutoff) },
  ];
}

/**
 * Run every period that's eligible right now. Each call rolls at most one
 * period per kind (the latest one whose end ≤ cutoff). To backfill an old
 * deployment, the cron runs this on every tick — successive ticks will catch
 * up older periods because `rollup` reads/writes are idempotent and the
 * latest-eligible heuristic is stable.
 */
export async function runDueRollups(deps: RollupDeps): Promise<RollupReport[]> {
  const now = (deps.now ?? (() => new Date()))();
  const periods = dueRollupPeriods(now);
  const reports: RollupReport[] = [];
  for (const p of periods) {
    reports.push(await rollup(p, deps));
  }
  return reports;
}

type KindStats = { count: number; dismissed: number; requires_action: number };

function aggregateRaw(rows: RawSignalForRollup[]): Map<string, KindStats> {
  const map = new Map<string, KindStats>();
  for (const r of rows) {
    const cur = map.get(r.kind) ?? {
      count: 0,
      dismissed: 0,
      requires_action: 0,
    };
    cur.count++;
    if (r.dismissed_at) cur.dismissed++;
    if (r.requires_action) cur.requires_action++;
    map.set(r.kind, cur);
  }
  return map;
}

function aggregateMonthRollups(rows: RollupRow[]): Map<string, KindStats> {
  const map = new Map<string, KindStats>();
  for (const r of rows) {
    const cur = map.get(r.kind) ?? {
      count: 0,
      dismissed: 0,
      requires_action: 0,
    };
    cur.count += r.count;
    cur.dismissed += Number(r.stats?.dismissed ?? 0);
    cur.requires_action += Number(r.stats?.requires_action ?? 0);
    map.set(r.kind, cur);
  }
  return map;
}

export function nextPeriodStart(kind: PeriodKind, start: Date): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  if (kind === "month") return new Date(Date.UTC(y, m + 1, 1));
  if (kind === "quarter") return new Date(Date.UTC(y, m + 3, 1));
  return new Date(Date.UTC(y + 1, 0, 1));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subDays(d: Date, n: number): Date {
  return new Date(d.getTime() - n * 24 * 3600 * 1000);
}

/**
 * Latest month-period start whose end ≤ cutoff.
 * The month containing cutoff still has its end > cutoff, so we step back one.
 */
function lastMonthStartBefore(cutoff: Date): Date {
  return new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - 1, 1),
  );
}

function lastQuarterStartBefore(cutoff: Date): Date {
  const m = cutoff.getUTCMonth();
  const currentQStartMonth = Math.floor(m / 3) * 3;
  return new Date(Date.UTC(cutoff.getUTCFullYear(), currentQStartMonth - 3, 1));
}

function lastYearStartBefore(cutoff: Date): Date {
  return new Date(Date.UTC(cutoff.getUTCFullYear() - 1, 0, 1));
}
