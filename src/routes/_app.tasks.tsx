import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { Signal, SignalKind } from "#/lib/signal";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type StoredSignal = Signal & { id: string; dismissed_at: string | null };

type StatusFilter = "all" | SignalKind;

const TICKET_KINDS: SignalKind[] = [
  "ticket_assigned",
  "ticket_in_progress",
  "ticket_in_review",
  "ticket_blocked",
];

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ticket_assigned", label: "Todo" },
  { id: "ticket_in_progress", label: "In progress" },
  { id: "ticket_in_review", label: "In review" },
  { id: "ticket_blocked", label: "Blocked" },
];

function TasksPage() {
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const reload = useCallback(async () => {
    try {
      const body = (await apiFetch("/api/signals?filter=tickets")) as {
        signals: StoredSignal[];
      };
      setSignals(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <TasksView
      signals={signals}
      filter={filter}
      onFilterChange={setFilter}
      error={error}
    />
  );
}

export function TasksView({
  signals,
  filter,
  onFilterChange,
  error,
}: {
  signals: StoredSignal[] | null;
  filter: StatusFilter;
  onFilterChange: (f: StatusFilter) => void;
  error: string | null;
}) {
  const groups = useMemo(() => groupByKind(signals ?? []), [signals]);
  const visible = filter === "all" ? signals : (groups[filter] ?? []);
  return (
    <section className="p-8">
      <header>
        <h1 className="text-xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Tickets assigned to you across Linear and Jira.
        </p>
      </header>

      <nav aria-label="Status filters" className="mt-4 flex gap-2">
        {FILTERS.map((f) => {
          const count =
            f.id === "all"
              ? (signals?.length ?? 0)
              : (groups[f.id]?.length ?? 0);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                filter === f.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              )}
            >
              {f.label}
              <span className="ml-1 text-xs opacity-70">{count}</span>
            </button>
          );
        })}
      </nav>

      {error && (
        <p className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {signals == null && !error && (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      )}

      {signals && signals.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500">
          No assigned tickets. Connect Linear or Jira from Settings →
          Integrations to start syncing.
        </p>
      )}

      {visible && visible.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {visible.map((s) => (
            <TicketRow key={s.id} signal={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TicketRow({ signal }: { signal: StoredSignal }) {
  const identifier =
    (signal.payload?.identifier as string | undefined) ?? signal.source_id;
  const stateName = signal.payload?.state_name as string | undefined;
  const priority = signal.payload?.priority_label as string | undefined;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="font-mono text-xs text-zinc-500">{identifier}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-900">
          {signal.title}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {[statusLabel(signal.kind), stateName, priority]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {signal.url && (
        <a
          href={signal.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      )}
    </li>
  );
}

function groupByKind(
  signals: StoredSignal[],
): Partial<Record<SignalKind, StoredSignal[]>> {
  const out: Partial<Record<SignalKind, StoredSignal[]>> = {};
  for (const s of signals) {
    if (!TICKET_KINDS.includes(s.kind)) continue;
    const bucket = out[s.kind] ?? [];
    bucket.push(s);
    out[s.kind] = bucket;
  }
  return out;
}

function statusLabel(kind: SignalKind): string {
  switch (kind) {
    case "ticket_assigned":
      return "Todo";
    case "ticket_in_progress":
      return "In progress";
    case "ticket_in_review":
      return "In review";
    case "ticket_blocked":
      return "Blocked";
    default:
      return kind;
  }
}
