import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar as CalIcon,
  ExternalLink,
  Github,
  Slack,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { Signal, SignalKind, SignalProvider } from "#/lib/signal";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

type StoredSignal = Signal & { id: string; dismissed_at: string | null };

type Filter = "all" | "prs" | "tickets" | "mentions" | "meetings";

const FILTERS: Array<{ id: Filter; label: string; enabled: boolean }> = [
  { id: "all", label: "All", enabled: true },
  { id: "prs", label: "PRs", enabled: true },
  { id: "tickets", label: "Tickets", enabled: false },
  { id: "mentions", label: "Mentions", enabled: true },
  { id: "meetings", label: "Meetings", enabled: true },
];

function InboxPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      setSelectedId((prev) => (prev === id ? null : prev));
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
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
}

export function InboxView({
  filter,
  onFilterChange,
  signals,
  error,
  onDismiss,
  selectedId = null,
  onSelect,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  signals: StoredSignal[] | null;
  error: string | null;
  onDismiss: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const selected = useMemo(
    () => signals?.find((s) => s.id === selectedId) ?? null,
    [signals, selectedId],
  );
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
        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <ul className="flex-1 divide-y divide-zinc-200 rounded border border-zinc-200 bg-white">
            {signals.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  selectedId === s.id && "bg-zinc-50",
                )}
              >
                <ProviderBadge provider={s.provider} />
                <button
                  type="button"
                  onClick={() => onSelect?.(s.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium text-zinc-900">
                    {s.title}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {kindLabel(s.kind)} · {secondaryLabel(s)}
                  </div>
                </button>
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
          {selected && (
            <InboxDetailPane
              signal={selected}
              onClose={() => onSelect?.(null)}
              onDismiss={onDismiss}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function InboxDetailPane({
  signal,
  onClose,
  onDismiss,
}: {
  signal: StoredSignal;
  onClose: () => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <aside
      aria-label="Signal detail"
      className="w-full rounded border border-zinc-200 bg-white p-5 lg:w-[360px] lg:shrink-0"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderBadge provider={signal.provider} />
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {kindLabel(signal.kind)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <h2 className="mt-3 text-base font-semibold text-zinc-900">
        {signal.title}
      </h2>
      <DetailBody signal={signal} />
      <div className="mt-5 flex flex-wrap gap-2">
        {signal.url && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            <ExternalLink className="h-4 w-4" />
            {openLabel(signal.provider)}
          </a>
        )}
        <button
          type="button"
          onClick={() => onDismiss(signal.id)}
          className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}

function DetailBody({ signal }: { signal: StoredSignal }) {
  const group = kindGroup(signal.kind);
  if (group === "pr") return <PrBody signal={signal} />;
  if (group === "slack") return <SlackBody signal={signal} />;
  return <MeetingBody signal={signal} />;
}

function PrBody({ signal }: { signal: StoredSignal }) {
  const repo = signal.payload?.repo as string | undefined;
  const number = signal.payload?.number as number | undefined;
  const author = signal.payload?.author as string | undefined;
  const draft = Boolean(signal.payload?.draft);
  return (
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {repo && (
        <>
          <dt className="text-zinc-500">Repo</dt>
          <dd className="text-zinc-900">
            {repo}
            {typeof number === "number" ? `#${number}` : ""}
          </dd>
        </>
      )}
      {author && (
        <>
          <dt className="text-zinc-500">Author</dt>
          <dd className="text-zinc-900">@{author}</dd>
        </>
      )}
      <dt className="text-zinc-500">Status</dt>
      <dd className="text-zinc-900">
        {draft
          ? "Draft"
          : signal.requires_action
            ? "Awaiting your action"
            : "Tracking"}
      </dd>
    </dl>
  );
}

function SlackBody({ signal }: { signal: StoredSignal }) {
  const channel = signal.payload?.channel as string | undefined;
  const channelType = signal.payload?.channel_type as string | undefined;
  const author = signal.payload?.author as string | undefined;
  const text = signal.payload?.text as string | undefined;
  const where =
    channelType === "im" ? "Direct message" : channel ? `#${channel}` : null;
  return (
    <div className="mt-3 space-y-2 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {where && (
          <>
            <dt className="text-zinc-500">Where</dt>
            <dd className="text-zinc-900">{where}</dd>
          </>
        )}
        {author && (
          <>
            <dt className="text-zinc-500">From</dt>
            <dd className="text-zinc-900">{`<@${author}>`}</dd>
          </>
        )}
      </dl>
      {text && (
        <blockquote className="mt-2 whitespace-pre-line border-l-2 border-zinc-200 pl-3 text-zinc-700">
          {text}
        </blockquote>
      )}
    </div>
  );
}

function MeetingBody({ signal }: { signal: StoredSignal }) {
  const startsAt = signal.payload?.starts_at as string | undefined;
  const endsAt = signal.payload?.ends_at as string | undefined;
  const videoLink = signal.payload?.video_link as string | undefined;
  const organizer = signal.payload?.organizer as string | undefined;
  const linkedItems =
    (signal.payload?.linked_items as
      | Array<{
          kind: string;
          url: string;
          repo?: string;
          number?: number;
          key?: string;
        }>
      | undefined) ?? [];
  return (
    <div className="mt-3 space-y-3 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {startsAt && (
          <>
            <dt className="text-zinc-500">When</dt>
            <dd className="text-zinc-900">
              {formatMeetingTime(startsAt, endsAt)}
            </dd>
          </>
        )}
        {organizer && (
          <>
            <dt className="text-zinc-500">Organizer</dt>
            <dd className="text-zinc-900">{organizer}</dd>
          </>
        )}
      </dl>
      {videoLink && (
        <a
          href={videoLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
        >
          <Video className="h-4 w-4" />
          Join
        </a>
      )}
      {linkedItems.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Linked items
          </p>
          <ul className="mt-1 space-y-1">
            {linkedItems.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-zinc-700 underline hover:text-zinc-900"
                >
                  {item.kind === "pr" && item.repo
                    ? `${item.repo}#${item.number}`
                    : (item.key ?? item.url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatMeetingTime(startsAt: string, endsAt?: string): string {
  const s = new Date(startsAt);
  if (Number.isNaN(s.getTime())) return startsAt;
  const start = s.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return start;
  const e = new Date(endsAt);
  if (Number.isNaN(e.getTime())) return start;
  const end = e.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start} – ${end}`;
}

function kindGroup(kind: SignalKind): "pr" | "slack" | "meeting" {
  if (kind === "meeting") return "meeting";
  if (kind === "dm" || kind === "mention" || kind === "thread_reply")
    return "slack";
  return "pr";
}

function openLabel(provider: SignalProvider): string {
  if (provider === "github") return "Open in GitHub";
  if (provider === "slack") return "Open in Slack";
  return "Open in Calendar";
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
    case "dm":
      return "Direct message";
    case "mention":
      return "Mention";
    case "thread_reply":
      return "Thread reply";
    default:
      return kind;
  }
}

function secondaryLabel(s: StoredSignal): string {
  if (s.provider === "slack") {
    const channelType = s.payload?.channel_type as string | undefined;
    const channel = s.payload?.channel as string | undefined;
    const author = s.payload?.author as string | undefined;
    const where = channelType === "im" ? "DM" : channel ? `#${channel}` : "";
    return [where, author && `from <@${author}>`].filter(Boolean).join(" · ");
  }
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
