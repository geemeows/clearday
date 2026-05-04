import { createFileRoute } from "@tanstack/react-router";
import { Calendar as CalIcon, ExternalLink, Github, Slack } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { Signal, SignalProvider } from "#/lib/signal";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

type StoredSignal = Signal & { id: string; dismissed_at: string | null };

type Filter = "all" | "prs" | "tickets" | "mentions" | "meetings";

const FILTERS: Array<{ id: Filter; label: string; enabled: boolean }> = [
  { id: "all", label: "All", enabled: true },
  { id: "prs", label: "PRs", enabled: true },
  { id: "tickets", label: "Tickets", enabled: false },
  { id: "mentions", label: "Mentions", enabled: false },
  { id: "meetings", label: "Meetings", enabled: true },
];

function InboxPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (current: Filter) => {
    try {
      const body = (await apiFetch(`/api/signals?filter=${current}`)) as {
        signals: StoredSignal[];
      };
      setSignals(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    reload(filter);
  }, [filter, reload]);

  const dismiss = useCallback(
    async (id: string) => {
      setSignals((current) => current?.filter((s) => s.id !== id) ?? null);
      await apiFetch(`/api/signals/${id}/dismiss`, { method: "POST" });
      reload(filter);
    },
    [filter, reload],
  );

  return (
    <InboxView
      filter={filter}
      onFilterChange={setFilter}
      signals={signals}
      error={error}
      onDismiss={dismiss}
    />
  );
}

export function InboxView({
  filter,
  onFilterChange,
  signals,
  error,
  onDismiss,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  signals: StoredSignal[] | null;
  error: string | null;
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="p-8">
      <header>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Unified Signals from your sources.
        </p>
      </header>

      <nav aria-label="Inbox filters" className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.id}
            disabled={!f.enabled}
            aria-pressed={filter === f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.id
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
              !f.enabled && "cursor-not-allowed opacity-50",
            )}
          >
            {f.label}
          </button>
        ))}
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
          Nothing here. New Signals show up automatically.
        </p>
      )}

      {signals && signals.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
          {signals.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <ProviderBadge provider={s.provider} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-900">
                  {s.title}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {kindLabel(s.kind)} · {secondaryLabel(s)}
                </div>
              </div>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
              )}
              <button
                type="button"
                onClick={() => onDismiss(s.id)}
                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProviderBadge({ provider }: { provider: SignalProvider }) {
  const Icon =
    provider === "github" ? Github : provider === "slack" ? Slack : CalIcon;
  return (
    <span
      role="img"
      aria-label={`Source: ${provider}`}
      className="flex h-7 w-7 items-center justify-center rounded bg-zinc-100 text-zinc-700"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "pr_review_requested":
      return "Review requested";
    case "pr_authored":
      return "Authored PR";
    case "pr_assigned":
      return "Assigned PR";
    case "meeting":
      return "Meeting";
    default:
      return kind;
  }
}

function secondaryLabel(s: StoredSignal): string {
  if (s.kind === "meeting") {
    const startsAt = s.payload?.starts_at as string | undefined;
    if (!startsAt) return "";
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const repo = (s.payload?.repo as string | undefined) ?? "";
  const author = (s.payload?.author as string | undefined) ?? "";
  return [repo, author && `by @${author}`].filter(Boolean).join(" · ");
}
