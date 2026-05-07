import { useEffect, useMemo, useState } from "react";
import {
  computeWeekStats,
  type PulseSourceKey,
  type WeekStats,
} from "#/features/signals/views/today";
import { PulseBars } from "#/features/today/PulseBars";
import { PulseDonut, type PulseDonutSlice } from "#/features/today/PulseDonut";
import { PulseLine } from "#/features/today/PulseLine";
import { apiFetch } from "#/lib/api-client";
import type { StoredSignal } from "#/shared/signal";

type PulseLoader = (since: string) => Promise<StoredSignal[]>;

const defaultPulseLoader: PulseLoader = async (since) => {
  const body = (await apiFetch(
    `/api/signals?filter=all&include_dismissed=true&since=${encodeURIComponent(since)}&limit=200`,
  )) as { signals: StoredSignal[] };
  return body.signals;
};

const SOURCE_LABEL: Record<PulseSourceKey, string> = {
  github: "GitHub",
  slack: "Slack",
  calendar: "Calendar",
  linear: "Linear",
  ai: "AI",
};

const SOURCE_COLOR: Record<PulseSourceKey, string> = {
  github: "var(--src-git)",
  slack: "var(--src-slack)",
  calendar: "var(--src-cal)",
  linear: "var(--src-task)",
  ai: "var(--src-ai)",
};

function toDonutData(stats: WeekStats): PulseDonutSlice[] {
  return stats.sourceMix.map((entry) => ({
    source: entry.source,
    count: entry.count,
    color: SOURCE_COLOR[entry.source],
  }));
}

function formatLatencyDelta(delta: number): {
  text: string;
  positive: boolean;
} {
  if (delta === 0) return { text: "no change vs 7d ago", positive: true };
  const positive = delta < 0;
  const abs = Math.abs(delta);
  const arrow = positive ? "↓" : "↑";
  const verb = positive ? "faster" : "slower";
  return {
    text: `${arrow} ${abs}h ${verb} than 7d ago`,
    positive,
  };
}

export function PulseCard({
  now,
  loader = defaultPulseLoader,
}: {
  now: Date;
  loader?: PulseLoader;
}) {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sinceIso = useMemo(() => {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d.toISOString();
  }, [now]);

  useEffect(() => {
    let cancelled = false;
    loader(sinceIso)
      .then((list) => {
        if (cancelled) return;
        setStats(computeWeekStats(list, new Date()));
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [loader, sinceIso]);

  return (
    <article
      aria-label="Pulse"
      className="rounded-lg border border-border bg-card p-6"
    >
      <header className="flex items-baseline gap-2">
        <span className="font-semibold text-base text-foreground">Pulse</span>
        <span className="text-muted-foreground text-xs">last 7 days</span>
      </header>

      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
      {!error && stats == null && (
        <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && stats != null && <PulseBody stats={stats} />}
    </article>
  );
}

function PulseBody({ stats }: { stats: WeekStats }) {
  const donutData = toDonutData(stats);
  const totalSignals = donutData.reduce((acc, d) => acc + d.count, 0);
  const delta = formatLatencyDelta(stats.latencyDeltaHours);
  const totalPrs = stats.shippedByDay.reduce((acc, d) => acc + d.prs, 0);
  const totalTickets = stats.shippedByDay.reduce(
    (acc, d) => acc + d.tickets,
    0,
  );

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
      {/* Donut — signal source mix */}
      <section className="flex items-center gap-4 md:border-r md:border-border md:pr-6">
        <PulseDonut data={donutData} />
        <ul className="flex flex-col gap-1.5 text-xs">
          {donutData.map((d) => (
            <li key={d.source} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ background: d.color }}
              />
              <span className="min-w-14 text-foreground">
                {SOURCE_LABEL[d.source]}
              </span>
              <span className="font-mono text-muted-foreground">{d.count}</span>
            </li>
          ))}
        </ul>
        <span className="sr-only">{totalSignals} signals total</span>
      </section>

      {/* Line — review latency */}
      <section className="md:border-r md:border-border md:px-6">
        <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          Review latency
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          median time-to-first-comment, lower is better
        </p>
        <div className="mt-2">
          <PulseLine values={stats.reviewLatencyHours} />
        </div>
        <p
          data-trend={delta.positive ? "down" : "up"}
          className={
            delta.positive
              ? "mt-1 font-medium text-[11px] text-emerald-600"
              : "mt-1 font-medium text-[11px] text-destructive"
          }
        >
          {delta.text}
        </p>
      </section>

      {/* Bars — shipped */}
      <section className="md:pl-6">
        <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
          Shipped this week
        </h3>
        <p className="mt-1 text-muted-foreground text-xs">
          PRs merged · Tickets closed
        </p>
        <div className="mt-2">
          <PulseBars data={stats.shippedByDay} />
        </div>
        <p className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: "var(--ink)" }}
            />
            {totalPrs} PRs
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ background: "var(--accent)" }}
            />
            {totalTickets} tickets
          </span>
        </p>
      </section>
    </div>
  );
}
