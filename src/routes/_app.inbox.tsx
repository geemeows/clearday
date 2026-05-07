import { createFileRoute } from "@tanstack/react-router";
import { Calendar as CalIcon, ChevronRight, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/coss/tabs";
import { Skeleton } from "#/components/ui/skeleton";
import {
  providerOpenLabel,
  providerSourceKind,
  signalKindLabel,
} from "#/features/integrations/display";
import {
  InboxPreviewRow,
  InboxPreviewRowSkeleton,
} from "#/features/signals/components/InboxPreviewRow";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { filterMeetingsToToday } from "#/features/signals/views/today";
import { useAutoRefresh } from "#/hooks/use-auto-refresh";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import { supabase } from "#/lib/supabase";
import type { Signal, SignalKind } from "#/shared/signal";

const inboxSearchSchema = z.object({
  signal: z.string().optional(),
});

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: inboxSearchSchema,
  component: InboxPage,
});

type StoredSignal = Signal & {
  id: string;
  dismissed_at: string | null;
  priority?: "low" | "high" | null;
  snoozed_until?: string | null;
  unread_count?: number;
};

type Filter = "all" | "prs" | "tickets" | "mentions" | "meetings";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "prs", label: "PRs" },
  { id: "tickets", label: "Tickets" },
  { id: "mentions", label: "Mentions" },
  { id: "meetings", label: "Meetings" },
];

const SKELETON_ROWS = [
  { id: "sk-a", width: "78%" },
  { id: "sk-b", width: "55%" },
  { id: "sk-c", width: "82%" },
  { id: "sk-d", width: "44%" },
  { id: "sk-e", width: "70%" },
  { id: "sk-f", width: "60%" },
  { id: "sk-g", width: "76%" },
  { id: "sk-h", width: "50%" },
];

function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = search.signal ?? null;
  const setSelectedId = useCallback(
    (next: string | null) => {
      navigate({
        search: (prev) => ({ ...prev, signal: next ?? undefined }),
        replace: true,
      });
    },
    [navigate],
  );
  const [repliedIds, setRepliedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    try {
      const body = (await apiFetch("/api/signals?filter=all")) as {
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

  useAutoRefresh(reload);

  const dismiss = useCallback(
    async (id: string) => {
      setSignals((current) => current?.filter((s) => s.id !== id) ?? null);
      if (selectedId === id) setSelectedId(null);
      setRepliedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await apiFetch(`/api/signals/${id}/dismiss`, { method: "POST" });
      reload();
    },
    [reload, selectedId, setSelectedId],
  );

  const handleReplyStart = useCallback((id: string) => {
    setRepliedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleReplyRollback = useCallback((id: string) => {
    setRepliedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Inbox is "what's happening now/next" — clip meetings to today regardless
  // of the active filter; non-meeting signals are unaffected.
  const visibleSignals = signals ? filterMeetingsToToday(signals) : signals;

  return (
    <InboxView
      filter={filter}
      onFilterChange={setFilter}
      signals={visibleSignals}
      error={error}
      onDismiss={dismiss}
      selectedId={selectedId}
      onSelect={setSelectedId}
      repliedIds={repliedIds}
      onReplyStart={handleReplyStart}
      onReplyRollback={handleReplyRollback}
    />
  );
}

export function filterToGroup(f: Filter): SignalGroup | null {
  if (f === "prs") return "pr";
  if (f === "tickets") return "ticket";
  if (f === "mentions") return "slack";
  if (f === "meetings") return "meeting";
  return null;
}

export function computeFilterCounts(
  signals: ReadonlyArray<StoredSignal>,
): Record<Filter, number> {
  const counts: Record<Filter, number> = {
    all: signals.length,
    prs: 0,
    tickets: 0,
    mentions: 0,
    meetings: 0,
  };
  for (const s of signals) {
    const g = kindGroup(s.kind);
    if (g === "pr") counts.prs += 1;
    else if (g === "ticket") counts.tickets += 1;
    else if (g === "slack") counts.mentions += 1;
    else if (g === "meeting") counts.meetings += 1;
  }
  return counts;
}

export function InboxView({
  filter,
  onFilterChange,
  signals,
  error,
  onDismiss,
  selectedId = null,
  onSelect,
  repliedIds,
  onReplyStart,
  onReplyRollback,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  signals: StoredSignal[] | null;
  error: string | null;
  onDismiss: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  repliedIds?: ReadonlySet<string>;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const nowIso = new Date().toISOString();
  const counts = useMemo(
    () => (signals ? computeFilterCounts(signals) : null),
    [signals],
  );
  const visible = useMemo(() => {
    if (!signals) return null;
    const group = filterToGroup(filter);
    if (group == null) return signals;
    return signals.filter((s) => kindGroup(s.kind) === group);
  }, [signals, filter]);
  const selected = useMemo(
    () => visible?.find((s) => s.id === selectedId) ?? null,
    [visible, selectedId],
  );
  const total = visible?.length ?? 0;
  const unread = visible
    ? visible.filter(
        (s) => typeof s.unread_count === "number" && s.unread_count > 0,
      ).length
    : 0;

  if (error) {
    return (
      <section className="flex h-full min-h-0 flex-col px-8 pt-6">
        <p className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      </section>
    );
  }

  if (visible == null) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading inbox"
        className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]"
        style={{ background: "var(--canvas)" }}
      >
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ borderRight: "1px solid var(--hairline-soft)" }}
        >
          <div
            className="flex flex-col gap-3 px-[18px] pt-4 pb-3"
            style={{ borderBottom: "1px solid var(--hairline-soft)" }}
          >
            <div className="flex items-baseline">
              <h1
                className="font-semibold tracking-tight"
                style={{ fontSize: 21, lineHeight: 1.25, color: "var(--ink)" }}
              >
                Inbox
              </h1>
              <span
                className="ml-2.5 font-medium"
                style={{ fontSize: 13, color: "var(--muted-foreground)" }}
              >
                — unread · — total
              </span>
              <span className="flex-1" />
              <button
                type="button"
                disabled
                className="rounded-md px-3"
                style={{
                  height: 30,
                  fontSize: 12,
                  color: "var(--ink)",
                  opacity: 0.5,
                }}
              >
                Mark all read
              </button>
            </div>
            <nav
              aria-label="Inbox filters"
              className="flex flex-wrap items-center gap-1.5"
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    type="button"
                    key={f.id}
                    aria-pressed={active}
                    onClick={() => onFilterChange(f.id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
                    style={{
                      fontSize: 13,
                      background: active ? "var(--ink)" : "var(--surface-soft)",
                      color: active ? "var(--canvas)" : "var(--ink)",
                      border: "1px solid transparent",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {SKELETON_ROWS.map(({ id, width }) => (
              <li
                key={id}
                style={{
                  borderLeft: "2px solid transparent",
                  borderBottom: "1px solid var(--hairline-soft)",
                  padding: "2px 6px",
                }}
              >
                <InboxPreviewRowSkeleton titleWidth={width} />
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: "var(--canvas)" }} />
      </section>
    );
  }

  if (visible.length === 0) {
    return (
      <section
        className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-8 text-center"
        style={{ background: "var(--canvas)" }}
      >
        <p
          className="font-semibold tracking-tight"
          style={{ fontSize: 16, color: "var(--ink)" }}
        >
          Nothing here.
        </p>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          New signals show up automatically.
        </p>
      </section>
    );
  }

  return (
    <section
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ borderRight: "1px solid var(--hairline-soft)" }}
      >
        <div
          className="flex flex-col gap-3 px-[18px] pt-4 pb-3"
          style={{ borderBottom: "1px solid var(--hairline-soft)" }}
        >
          <div className="flex items-baseline">
            <h1
              className="font-semibold tracking-tight"
              style={{ fontSize: 21, lineHeight: 1.25, color: "var(--ink)" }}
            >
              Inbox
            </h1>
            <span
              className="ml-2.5 font-medium"
              style={{ fontSize: 13, color: "var(--muted-foreground)" }}
            >
              {unread} unread · {total} total
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="rounded-md px-3 hover:bg-(--surface-soft)"
              style={{ height: 30, fontSize: 12, color: "var(--ink)" }}
            >
              Mark all read
            </button>
          </div>
          <nav
            aria-label="Inbox filters"
            className="flex flex-wrap items-center gap-1.5"
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  type="button"
                  key={f.id}
                  aria-pressed={active}
                  onClick={() => onFilterChange(f.id)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
                  style={{
                    fontSize: 13,
                    background: active ? "var(--ink)" : "var(--surface-soft)",
                    color: active ? "var(--canvas)" : "var(--ink)",
                    border: "1px solid transparent",
                  }}
                >
                  {f.label}
                  {counts && (
                    <span
                      data-slot="filter-count"
                      className="tabular-nums"
                      style={{ fontSize: 11, opacity: 0.6 }}
                    >
                      {counts[f.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {visible.map((s) => (
            <InboxRow
              key={s.id}
              signal={s}
              selected={selectedId === s.id}
              replied={repliedIds?.has(s.id) ?? false}
              snoozed={!!s.snoozed_until && s.snoozed_until > nowIso}
              onSelect={() => onSelect?.(s.id)}
              onDismiss={() => onDismiss(s.id)}
              nowIso={nowIso}
            />
          ))}
        </ul>
      </div>
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ background: "var(--canvas)" }}
      >
        <InboxDetailPane
          signal={selected}
          onClose={() => onSelect?.(null)}
          onDismiss={onDismiss}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      </div>
    </section>
  );
}

export function InboxRow({
  signal,
  selected,
  replied,
  snoozed,
  onSelect,
  onDismiss,
  nowIso,
}: {
  signal: StoredSignal;
  selected: boolean;
  replied: boolean;
  snoozed: boolean;
  onSelect: () => void;
  // Kept on the prop type so the detail pane still receives the same callback;
  // dismiss is only surfaced in the detail pane now.
  onDismiss: () => void;
  nowIso: string;
}) {
  void onDismiss;
  const severity = severityOf(signal);
  const isAutoRule = signal.payload?.badge === "auto-rule";
  const chips = (
    <>
      {severity === "ci_fail" && (
        <SeverityChip tone="danger">CI FAIL</SeverityChip>
      )}
      {severity === "conflict" && (
        <SeverityChip tone="warning">CONFLICT</SeverityChip>
      )}
      {isAutoRule && <SeverityChip tone="muted">RULE</SeverityChip>}
      {replied && (
        <SeverityChip tone="success" className="uppercase tracking-wide">
          Replied
        </SeverityChip>
      )}
      {signal.priority === "high" && (
        <SeverityChip tone="danger" className="uppercase tracking-wide">
          High
        </SeverityChip>
      )}
      {signal.priority === "low" && (
        <SeverityChip tone="muted" className="uppercase tracking-wide">
          Low
        </SeverityChip>
      )}
      {snoozed && (
        <SeverityChip
          tone="warning"
          title={`Returns at ${formatSnoozeReturn(signal.snoozed_until)}`}
        >
          Snoozed · returns {formatSnoozeReturn(signal.snoozed_until)}
        </SeverityChip>
      )}
    </>
  );
  return (
    <li
      data-selected={selected || undefined}
      className={cn((replied || snoozed) && "opacity-60")}
      style={{
        background: selected ? "var(--surface-soft)" : "transparent",
        borderLeft: `2px solid ${selected ? "var(--primary)" : "transparent"}`,
        borderBottom: "1px solid var(--hairline-soft)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full"
        style={{ padding: "2px 6px" }}
      >
        <InboxPreviewRow
          signal={signal}
          nowIso={nowIso}
          chips={chips}
          unreadDisplay="count"
        />
      </button>
    </li>
  );
}

function SeverityChip({
  tone,
  className,
  children,
  title,
}: {
  tone: "danger" | "warning" | "muted" | "success";
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const style: React.CSSProperties =
    tone === "danger"
      ? { background: "var(--danger-soft)", color: "var(--destructive)" }
      : tone === "warning"
        ? { background: "var(--warn-soft)", color: "var(--warn)" }
        : tone === "success"
          ? { background: "var(--good-soft)", color: "var(--good)" }
          : {
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
            };
  return (
    <span
      data-slot="severity-chip"
      data-tone={tone}
      title={title}
      className={cn(
        "shrink-0 rounded-full px-[7px] py-px font-bold uppercase tracking-wide",
        className,
      )}
      style={{ fontSize: 10, lineHeight: 1.4, ...style }}
    >
      {children}
    </span>
  );
}

export function severityOf(
  signal: StoredSignal,
): "ci_fail" | "conflict" | null {
  const explicit = signal.payload?.severity as string | undefined;
  if (explicit === "ci_fail") return "ci_fail";
  if (explicit === "conflict") return "conflict";
  if (signal.payload?.ci_failed === true) return "ci_fail";
  if (signal.payload?.has_conflict === true) return "conflict";
  return null;
}

export function relAgo(iso: string | null, nowIso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(now)) return "";
  const diffMs = now - t;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return future ? "now" : "now";
  if (abs < hour) {
    const m = Math.round(abs / minute);
    return future ? `in ${m}m` : `${m}m ago`;
  }
  if (abs < day) {
    const h = Math.round(abs / hour);
    return future ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.round(abs / day);
  return future ? `in ${d}d` : `${d}d ago`;
}

export function InboxDetailPane({
  signal,
  onClose,
  onDismiss,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal | null;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  if (!signal) {
    return (
      <aside
        aria-label="Signal detail"
        className="hidden h-full items-center justify-center text-sm lg:flex"
        style={{ color: "var(--muted-foreground)" }}
      >
        Select a signal to see details.
      </aside>
    );
  }
  const group = kindGroup(signal.kind);
  return (
    <aside
      aria-label="Signal detail"
      data-detail-kind={group}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: "28px 32px" }}
    >
      <header
        className="flex items-center"
        style={{ gap: 8, marginBottom: 12 }}
      >
        <SourceGlyph source={providerSourceKind(signal.provider)} size={20} />
        <span
          className="font-medium uppercase tracking-wider"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          }}
        >
          {signalKindLabel(signal.kind)}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="rounded-full p-1 hover:bg-(--surface-strong)"
          style={{ color: "var(--muted-foreground)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <h2
        className="font-semibold tracking-tight"
        style={{
          fontSize: 22,
          lineHeight: 1.18,
          letterSpacing: "-0.4px",
          color: "var(--ink)",
          margin: "0 0 14px",
        }}
      >
        {signal.title}
      </h2>
      {group === "pr" && (
        <PRDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
      {group === "slack" && (
        <SlackDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
      {group === "meeting" && <MeetingDetail signal={signal} />}
      {group === "ticket" && <TaskDetail signal={signal} />}
      <div
        className="flex flex-wrap items-center gap-2"
        style={{
          marginTop: 24,
          padding: "16px 0",
          background: "var(--canvas)",
          borderTop: "1px solid var(--hairline-soft)",
        }}
      >
        <button
          type="button"
          onClick={() => onDismiss(signal.id)}
          className="inline-flex items-center justify-center rounded-md hover:bg-(--surface-soft)"
          style={{
            height: 32,
            padding: "0 12px",
            fontSize: 13,
            color: "var(--muted-foreground)",
          }}
        >
          Dismiss
        </button>
        <span className="flex-1" />
        {/* MeetingDetail carries its own Join meeting / Open invite buttons. */}
        {signal.url && group !== "meeting" && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md hover:bg-(--surface-soft)"
            style={{
              height: 32,
              padding: "0 12px",
              fontSize: 13,
              color: "var(--muted-foreground)",
            }}
          >
            {providerOpenLabel(signal.provider)} →
            {/* <ExternalLink className="h-3.5 w-3.5" aria-hidden /> */}
          </a>
        )}
      </div>
    </aside>
  );
}

export function TaskDetail({ signal }: { signal: StoredSignal }) {
  const identifier = signal.payload?.identifier as string | undefined;
  const stateName = signal.payload?.state_name as string | undefined;
  const priority = signal.payload?.priority_label as string | undefined;
  const teamKey = signal.payload?.team_key as string | undefined;
  return (
    <dl
      data-slot="task-detail"
      className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm"
    >
      {identifier && (
        <>
          <dt className="text-muted-foreground">Ticket</dt>
          <dd className="font-mono text-foreground">{identifier}</dd>
        </>
      )}
      {teamKey && (
        <>
          <dt className="text-muted-foreground">Team</dt>
          <dd className="text-foreground">{teamKey}</dd>
        </>
      )}
      {stateName && (
        <>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="text-foreground">{stateName}</dd>
        </>
      )}
      {priority && (
        <>
          <dt className="text-muted-foreground">Priority</dt>
          <dd className="text-foreground">{priority}</dd>
        </>
      )}
    </dl>
  );
}

export function PRDetail({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const repo = signal.payload?.repo as string | undefined;
  const number = signal.payload?.number as number | undefined;
  const author = signal.payload?.author as string | undefined;
  const authorAvatar = signal.payload?.author_avatar_url as string | undefined;
  const additions = signal.payload?.additions as number | undefined;
  const deletions = signal.payload?.deletions as number | undefined;
  const draft = Boolean(signal.payload?.draft);
  const aiSummary = signal.payload?.ai_summary as string | undefined;
  const filesChanged =
    (signal.payload?.files_changed as
      | Array<{ path: string; additions?: number; deletions?: number }>
      | undefined) ?? [];
  const recentComments =
    (signal.payload?.recent_comments as
      | Array<{ author: string; body: string; created_at?: string }>
      | undefined) ?? [];
  return (
    <div data-slot="pr-detail" className="mt-3 space-y-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
        {repo && (
          <>
            <dt className="text-muted-foreground">Repo</dt>
            <dd className="text-foreground">
              {repo}
              {typeof number === "number" ? `#${number}` : ""}
            </dd>
          </>
        )}
        {author && (
          <>
            <dt className="text-muted-foreground">Author</dt>
            <dd className="flex items-center gap-2 text-foreground">
              <AuthorAvatar handle={author} src={authorAvatar} />
              <span>@{author}</span>
            </dd>
          </>
        )}
        {(typeof additions === "number" || typeof deletions === "number") && (
          <>
            <dt className="text-muted-foreground">Diff</dt>
            <dd className="font-mono text-xs">
              {typeof additions === "number" && (
                <span className="text-emerald-600">+{additions}</span>
              )}
              {typeof additions === "number" &&
                typeof deletions === "number" && <span> </span>}
              {typeof deletions === "number" && (
                <span className="text-destructive">-{deletions}</span>
              )}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Status</dt>
        <dd className="text-foreground">
          {draft
            ? "Draft"
            : signal.requires_action
              ? "Awaiting your action"
              : "Tracking"}
        </dd>
      </dl>
      {aiSummary && (
        <section
          aria-label="AI summary"
          className="flex items-start gap-3"
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "var(--src-ai-bg)",
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <SourceGlyph source="ai" size={20} />
          <div className="flex-1">
            <header
              className="font-bold uppercase tracking-wider"
              style={{
                fontSize: 9,
                color: "var(--src-ai)",
                marginBottom: 4,
              }}
            >
              AI Summary
            </header>
            <p
              className="whitespace-pre-line"
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--body, var(--foreground))",
              }}
            >
              {aiSummary}
            </p>
          </div>
        </section>
      )}
      {filesChanged.length > 0 && (
        <section aria-label="Files changed">
          <header
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: 9,
              color: "var(--muted-foreground)",
              marginBottom: 8,
            }}
          >
            Files Changed
          </header>
          <ul className="flex flex-col">
            {filesChanged.map((f) => (
              <li
                key={f.path}
                className="flex items-center"
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  className="flex-1 truncate"
                  style={{
                    fontSize: 12,
                    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                    color: "var(--body, var(--foreground))",
                  }}
                >
                  {f.path}
                </span>
                <span
                  className="shrink-0"
                  style={{
                    fontSize: 12,
                    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                  }}
                >
                  {typeof f.additions === "number" && (
                    <span style={{ color: "var(--good)" }}>+{f.additions}</span>
                  )}
                  {typeof f.additions === "number" &&
                    typeof f.deletions === "number" && (
                      <span
                        style={{ color: "var(--muted-soft)", margin: "0 4px" }}
                      >
                        ·
                      </span>
                    )}
                  {typeof f.deletions === "number" && (
                    <span style={{ color: "var(--destructive)" }}>
                      -{f.deletions}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {repo && typeof number === "number" && (
        <PrPullRequestPanel repo={repo} number={number} />
      )}
      {recentComments.length > 0 && (
        <section aria-label="Recent comments">
          <header
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: 9,
              color: "var(--muted-foreground)",
              marginBottom: 8,
            }}
          >
            Recent Comments
          </header>
          <ol className="flex flex-col" style={{ gap: 14 }}>
            {recentComments.map((c, i) => (
              <li
                key={`${c.author}-${c.created_at ?? i}`}
                className="grid items-start"
                style={{ gridTemplateColumns: "auto 1fr", gap: 12 }}
              >
                <div
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--surface-strong)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {c.author.slice(0, 1).toUpperCase()}
                </div>
                <div
                  style={{
                    background: "var(--surface-soft)",
                    borderRadius: 12,
                    padding: "10px 14px",
                  }}
                >
                  <div
                    className="flex items-baseline"
                    style={{ gap: 8, marginBottom: 4 }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      @{c.author}
                    </span>
                  </div>
                  <p
                    className="whitespace-pre-line"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--body, var(--foreground))",
                    }}
                  >
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {repo && typeof number === "number" && !draft && (
        <PrReviewActions
          repo={repo}
          number={number}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
}

function AuthorAvatar({ handle, src }: { handle: string; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={`@${handle}`}
        className="h-5 w-5 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium uppercase text-muted-foreground"
    >
      {handle.slice(0, 1)}
    </span>
  );
}

type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

type PrReviewSubmit = (params: {
  repo: string;
  number: number;
  event: PrReviewEvent;
  body?: string;
  signal_id?: string;
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

const defaultPrReviewSubmit: PrReviewSubmit = async (params) =>
  (await apiFetch("/api/pr/review", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

type DraftReplyResultUi =
  | { ok: true; draft: string }
  | { ok: false; reason: string; error?: string };

type DraftRequest = (params: {
  signal_id: string;
  instruction?: string;
}) => Promise<DraftReplyResultUi>;

const defaultDraftRequest: DraftRequest = async (params) =>
  (await apiFetch("/api/ai/draft", {
    method: "POST",
    body: params,
  })) as DraftReplyResultUi;

function draftRefusedMessage(reason: string): string {
  if (reason === "no_provider") return "No AI provider configured.";
  if (reason === "budget_reached")
    return "AI disabled — monthly budget reached.";
  if (reason === "disabled") return "AI is disabled for this account.";
  return "AI draft failed.";
}

type RequestConnectUrl = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

type OpenUrl = (url: string) => void;

const defaultRequestConnectUrl: RequestConnectUrl = async (provider) =>
  (await apiFetch(`/api/providers/${provider}/connect-url`)) as {
    ok: boolean;
    url?: string;
    error?: string;
  };

const defaultOpenUrl: OpenUrl = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

type PrFilesResult =
  | { ok: true; files: PrFile[] }
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

type PrFilesLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrFilesResult>;

const defaultPrFilesLoader: PrFilesLoader = async ({ repo, number }) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/files?${qs}`)) as PrFilesResult;
};

export type PrReviewComment = {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  diff_hunk: string | null;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrIssueComment = {
  id: number;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrOverviewResult =
  | {
      ok: true;
      body: string | null;
      author: string | null;
      author_avatar_url: string | null;
      review_comments: PrReviewComment[];
      issue_comments: PrIssueComment[];
    }
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

export type PrOverviewLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrOverviewResult>;

const defaultPrOverviewLoader: PrOverviewLoader = async ({ repo, number }) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/overview?${qs}`)) as PrOverviewResult;
};

// rehype-sanitize schema based on the GitHub default but with a few extras
// commonly found in PR bodies: image dimensions, video poster, and `align` on
// images / paragraphs (GitHub authors lean on these often).
const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...((defaultSchema.attributes?.img as Array<unknown>) ?? []),
      "align",
      "width",
      "height",
      "loading",
      "style",
    ],
    a: [
      ...((defaultSchema.attributes?.a as Array<unknown>) ?? []),
      "rel",
      "target",
    ],
    "*": [
      ...((defaultSchema.attributes?.["*"] as Array<unknown>) ?? []),
      "align",
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "video",
    "source",
  ],
};

// Hosts whose images Chrome blocks under ORB or that require a github auth
// token to fetch (user-attachments). These need to go through our worker
// proxy at /api/github/asset, which fetches server-side with the user's
// token and re-emits the bytes from our origin.
const GITHUB_ASSET_PROXY_HOSTS = new Set([
  "github.com",
  "user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
]);

function proxyGithubAssetUrl(
  src: string | undefined,
  authToken: string | null,
): string | undefined {
  if (!src) return src;
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return src;
  }
  if (parsed.protocol !== "https:") return src;
  if (!GITHUB_ASSET_PROXY_HOSTS.has(parsed.hostname)) return src;
  const qs = `url=${encodeURIComponent(parsed.toString())}${
    authToken ? `&auth=${encodeURIComponent(authToken)}` : ""
  }`;
  return `/api/github/asset?${qs}`;
}

function useSupabaseAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return token;
}

function Markdown({ children }: { children: string }) {
  const authToken = useSupabaseAccessToken();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
        a: ({ node: _n, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        img: ({ node: _n, src, ...props }) => (
          <img
            {...props}
            src={proxyGithubAssetUrl(
              typeof src === "string" ? src : undefined,
              authToken,
            )}
            loading="lazy"
            alt={props.alt ?? ""}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function groupCommentsByPath(
  comments: PrReviewComment[],
): Record<string, PrReviewComment[]> {
  const out: Record<string, PrReviewComment[]> = {};
  for (const c of comments) {
    if (!c.path) continue;
    if (!out[c.path]) out[c.path] = [];
    out[c.path].push(c);
  }
  return out;
}

export function PrDescription({
  repo,
  number,
  load = defaultPrOverviewLoader,
  onComments,
  onReviewComments,
  onIssueComments,
}: {
  repo: string;
  number: number;
  load?: PrOverviewLoader;
  onComments?: (commentsByPath: Record<string, PrReviewComment[]>) => void;
  onReviewComments?: (comments: PrReviewComment[]) => void;
  onIssueComments?: (comments: PrIssueComment[]) => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; body: string | null }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ repo, number })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ kind: "ok", body: out.body });
          onComments?.(groupCommentsByPath(out.review_comments));
          onReviewComments?.(out.review_comments);
          onIssueComments?.(out.issue_comments);
        } else {
          setState({ kind: "error", message: out.error });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load PR",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, number, load, onComments, onReviewComments, onIssueComments]);

  return (
    <section aria-label="PR description">
      {state.kind === "loading" && <PrDescriptionSkeleton />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--destructive)" }}
        >
          Couldn't load description: {state.message}
        </p>
      )}
      {state.kind === "ok" && !state.body && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          No description provided.
        </p>
      )}
      {state.kind === "ok" && state.body && (
        <div
          className="markdown-body"
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--body, var(--foreground))",
          }}
        >
          <Markdown>{state.body}</Markdown>
        </div>
      )}
    </section>
  );
}

function PrDescriptionSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading description"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-9/12" />
      <Skeleton className="h-3.5 w-10/12" />
      <Skeleton className="h-3.5 w-7/12" />
    </output>
  );
}

export function PrPullRequestPanel({
  repo,
  number,
  loadOverview,
  loadFiles,
}: {
  repo: string;
  number: number;
  loadOverview?: PrOverviewLoader;
  loadFiles?: PrFilesLoader;
}) {
  const [commentsByPath, setCommentsByPath] = useState<
    Record<string, PrReviewComment[]>
  >({});
  const [reviewComments, setReviewComments] = useState<PrReviewComment[]>([]);
  const [issueComments, setIssueComments] = useState<PrIssueComment[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const handleReviewComments = useCallback((comments: PrReviewComment[]) => {
    setReviewComments(comments);
    setOverviewLoading(false);
  }, []);
  return (
    <Tabs defaultValue="description">
      <TabsList variant="underline" className="w-full">
        <TabsTab value="description">Description</TabsTab>
        <TabsTab value="comments">
          Comments
          {reviewComments.length + issueComments.length > 0 && (
            <span
              data-slot="comment-count"
              className="ml-1 inline-flex items-center justify-center rounded-full px-1.5"
              style={{
                fontSize: 10,
                minWidth: 18,
                height: 18,
                background: "var(--surface-strong)",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              {reviewComments.length + issueComments.length}
            </span>
          )}
        </TabsTab>
        <TabsTab value="diff">Diff</TabsTab>
      </TabsList>
      <TabsPanel value="description" className="pt-3" keepMounted>
        <PrDescription
          repo={repo}
          number={number}
          load={loadOverview}
          onComments={setCommentsByPath}
          onReviewComments={handleReviewComments}
          onIssueComments={setIssueComments}
        />
      </TabsPanel>
      <TabsPanel value="comments" className="pt-3">
        <PrComments
          loading={overviewLoading}
          reviewComments={reviewComments}
          issueComments={issueComments}
        />
      </TabsPanel>
      <TabsPanel value="diff" className="pt-3">
        <PrDiffViewer
          repo={repo}
          number={number}
          load={loadFiles}
          commentsByPath={commentsByPath}
        />
      </TabsPanel>
    </Tabs>
  );
}

export function PrDiffViewer({
  repo,
  number,
  load = defaultPrFilesLoader,
  commentsByPath,
}: {
  repo: string;
  number: number;
  load?: PrFilesLoader;
  commentsByPath?: Record<string, PrReviewComment[]>;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; files: PrFile[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ repo, number })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) setState({ kind: "ok", files: out.files });
        else setState({ kind: "error", message: out.error });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load diff",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, number, load]);

  return (
    <section aria-label="PR diff">
      {state.kind === "loading" && <PrDiffSkeleton />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--destructive)" }}
        >
          Couldn't load diff: {state.message}
        </p>
      )}
      {state.kind === "ok" && state.files.length === 0 && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          No files changed.
        </p>
      )}
      {state.kind === "ok" && state.files.length > 0 && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {state.files.map((f) => (
            <PrFilePatch
              key={f.filename}
              file={f}
              comments={commentsByPath?.[f.filename] ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PrDiffSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading diff"
      className="flex flex-col"
      style={{ gap: 8 }}
    >
      {[
        { id: "diff-sk-a", w: "62%" },
        { id: "diff-sk-b", w: "48%" },
        { id: "diff-sk-c", w: "74%" },
      ].map((row) => (
        <div
          key={row.id}
          className="flex items-center"
          style={{
            border: "1px solid var(--hairline-soft)",
            borderRadius: 12,
            padding: "8px 12px",
            gap: 12,
          }}
        >
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3.5" style={{ width: row.w }} />
          <div className="flex-1" />
          <Skeleton className="h-3.5 w-10" />
        </div>
      ))}
    </output>
  );
}

type PrCommentEntry =
  | { kind: "issue"; data: PrIssueComment }
  | { kind: "review"; data: PrReviewComment };

export function PrComments({
  loading,
  reviewComments,
  issueComments,
}: {
  loading: boolean;
  reviewComments: PrReviewComment[];
  issueComments: PrIssueComment[];
}) {
  if (loading) return <PrCommentsSkeleton />;
  const entries: PrCommentEntry[] = [
    ...issueComments.map((c) => ({ kind: "issue" as const, data: c })),
    ...reviewComments.map((c) => ({ kind: "review" as const, data: c })),
  ].sort((a, b) => {
    const aT = a.data.created_at ?? "";
    const bT = b.data.created_at ?? "";
    return aT.localeCompare(bT);
  });
  if (entries.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        No comments yet.
      </p>
    );
  }
  return (
    <section
      aria-label="PR comments"
      className="flex flex-col"
      style={{ gap: 12 }}
    >
      {entries.map((entry) => (
        <PrCommentCard key={`${entry.kind}-${entry.data.id}`} entry={entry} />
      ))}
    </section>
  );
}

function PrCommentCard({ entry }: { entry: PrCommentEntry }) {
  const c = entry.data;
  return (
    <article
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline-soft)",
      }}
    >
      <header className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
        {c.user_avatar_url ? (
          <img
            src={c.user_avatar_url}
            alt={c.user ? `@${c.user}` : "commenter"}
            width={20}
            height={20}
            style={{
              borderRadius: "50%",
              border: "1px solid var(--hairline-soft)",
              objectFit: "cover",
            }}
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex items-center justify-center"
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--surface-strong)",
              color: "var(--ink)",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {(c.user?.[0] ?? "?").toUpperCase()}
          </span>
        )}
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          @{c.user ?? "unknown"}
        </span>
        {entry.kind === "review" && (
          <span
            data-slot="comment-kind"
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              padding: "2px 6px",
              borderRadius: 999,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            Review
          </span>
        )}
        {entry.kind === "review" && (entry.data as PrReviewComment).path && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
              color: "var(--muted-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {(entry.data as PrReviewComment).path}
            {typeof (entry.data as PrReviewComment).line === "number"
              ? `:${(entry.data as PrReviewComment).line}`
              : ""}
          </span>
        )}
        {c.created_at && (
          <span
            className="ml-auto"
            style={{ fontSize: 11, color: "var(--muted-foreground)" }}
          >
            {new Date(c.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </header>
      <div
        className="markdown-body"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--body, var(--foreground))",
        }}
      >
        <Markdown>{c.body}</Markdown>
      </div>
    </article>
  );
}

function PrCommentsSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading comments"
      className="flex flex-col"
      style={{ gap: 12 }}
    >
      {[
        { id: "cm-sk-a", lines: 2 },
        { id: "cm-sk-b", lines: 3 },
      ].map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-2"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: row.lines }).map((_, i) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton lines are positional
              key={i}
              className="h-3.5"
              style={{ width: `${60 + ((i * 13) % 30)}%` }}
            />
          ))}
        </div>
      ))}
    </output>
  );
}

function PrFilePatch({
  file,
  defaultOpen = false,
  comments = [],
}: {
  file: PrFile;
  defaultOpen?: boolean;
  comments?: PrReviewComment[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `pr-file-${file.filename.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <article
      data-slot="pr-file-patch"
      data-open={open || undefined}
      className="overflow-hidden"
      style={{
        border: "1px solid var(--hairline-soft)",
        borderRadius: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center text-left"
        style={{
          padding: "8px 12px",
          background: "var(--surface-soft)",
          borderBottom: open ? "1px solid var(--hairline-soft)" : "none",
          gap: 12,
        }}
      >
        <ChevronRight
          aria-hidden
          className="shrink-0 transition-transform"
          style={{
            width: 14,
            height: 14,
            color: "var(--muted-foreground)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            color: "var(--ink)",
          }}
        >
          {file.filename}
        </span>
        {comments.length > 0 && (
          <span
            data-slot="comment-count"
            title={`${comments.length} review ${comments.length === 1 ? "comment" : "comments"}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full"
            style={{
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--src-ai-bg)",
              color: "var(--src-ai)",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              role="presentation"
            >
              <title>review comments</title>
              <path d="M3 4h10v6H6l-3 3z" />
            </svg>
            {comments.length}
          </span>
        )}
        <span
          className="shrink-0"
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          }}
        >
          <span style={{ color: "var(--good)" }}>+{file.additions}</span>
          <span style={{ color: "var(--muted-soft)", margin: "0 4px" }}>·</span>
          <span style={{ color: "var(--destructive)" }}>-{file.deletions}</span>
        </span>
      </button>
      {open && (
        <div id={panelId}>
          {file.patch == null ? (
            <p
              className="m-0"
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            >
              Patch not available (binary or oversized file).
            </p>
          ) : (
            <PatchLines patch={file.patch} />
          )}
          {comments.length > 0 && <PrFileComments comments={comments} />}
        </div>
      )}
    </article>
  );
}

function PrFileComments({ comments }: { comments: PrReviewComment[] }) {
  return (
    <section
      aria-label="Review comments"
      className="flex flex-col"
      style={{
        gap: 10,
        padding: "12px",
        borderTop: "1px solid var(--hairline-soft)",
        background: "var(--surface-soft)",
      }}
    >
      {comments.map((c) => (
        <article
          key={c.id}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--canvas)",
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <header
            className="flex items-center"
            style={{ gap: 8, marginBottom: 6 }}
          >
            {c.user_avatar_url ? (
              <img
                src={c.user_avatar_url}
                alt={c.user ? `@${c.user}` : "reviewer"}
                width={20}
                height={20}
                style={{
                  borderRadius: "50%",
                  border: "1px solid var(--hairline-soft)",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex items-center justify-center"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--surface-strong)",
                  color: "var(--ink)",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {(c.user?.[0] ?? "?").toUpperCase()}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              @{c.user ?? "unknown"}
            </span>
            {typeof c.line === "number" && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                  color: "var(--muted-foreground)",
                }}
              >
                line {c.line}
              </span>
            )}
          </header>
          <p
            className="m-0 whitespace-pre-line"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--body, var(--foreground))",
            }}
          >
            {c.body}
          </p>
        </article>
      ))}
    </section>
  );
}

function PatchLines({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  return (
    <pre
      className="m-0 overflow-x-auto"
      style={{
        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      {lines.map((line, i) => {
        const tone =
          line.startsWith("+") && !line.startsWith("+++")
            ? "add"
            : line.startsWith("-") && !line.startsWith("---")
              ? "del"
              : line.startsWith("@@")
                ? "hunk"
                : "ctx";
        const bg =
          tone === "add"
            ? "var(--good-soft)"
            : tone === "del"
              ? "var(--danger-soft)"
              : tone === "hunk"
                ? "var(--src-cal-bg)"
                : "transparent";
        const fg =
          tone === "add"
            ? "var(--good)"
            : tone === "del"
              ? "var(--destructive)"
              : tone === "hunk"
                ? "var(--src-cal)"
                : "var(--body, var(--foreground))";
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: patch lines are positional and may repeat verbatim
            key={`${i}-${line}`}
            data-tone={tone}
            style={{
              display: "block",
              padding: "0 12px",
              background: bg,
              color: fg,
              whiteSpace: "pre",
            }}
          >
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function PrReviewActions({
  repo,
  number,
  signalId,
  submit = defaultPrReviewSubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  repo: string;
  number: number;
  signalId?: string;
  submit?: PrReviewSubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PrReviewEvent | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok"; event: PrReviewEvent }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("github");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setBody(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const run = async (event: PrReviewEvent) => {
    setPending(event);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        repo,
        number,
        event,
        body: body.trim(),
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok", event });
        setBody("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "review failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "review failed",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-label="PR review actions"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment (required for Request changes / Comment)"
        aria-label="Review comment"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("APPROVE")}
          disabled={pending !== null}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending === "APPROVE" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => run("REQUEST_CHANGES")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending === "REQUEST_CHANGES" ? "Sending…" : "Request changes"}
        </button>
        <button
          type="button"
          onClick={() => run("COMMENT")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending === "COMMENT" ? "Sending…" : "Comment"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending !== null}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">
          {status.event === "APPROVE"
            ? "Approved."
            : status.event === "REQUEST_CHANGES"
              ? "Changes requested."
              : "Comment posted."}
        </output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize GitHub"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function SlackDetail({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channel = signal.payload?.channel as string | undefined;
  const channelName = signal.payload?.channel_name as string | undefined;
  const channelType = signal.payload?.channel_type as string | undefined;
  const author = signal.payload?.author as string | undefined;
  const authorName = signal.payload?.author_name as string | undefined;
  const text = signal.payload?.text as string | undefined;
  const ts = signal.payload?.ts as string | undefined;
  const threadTs = signal.payload?.thread_ts as string | undefined;
  const where =
    channelType === "im"
      ? "Direct message"
      : channelName
        ? `#${channelName}`
        : channel
          ? `#${channel}`
          : null;
  return (
    <div data-slot="slack-detail" className="mt-3 space-y-4 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {where && (
          <>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="text-foreground">{where}</dd>
          </>
        )}
        {author && (
          <>
            <dt className="text-muted-foreground">From</dt>
            <dd className="text-foreground">
              {authorName ? authorName : `<@${author}>`}
            </dd>
          </>
        )}
      </dl>
      {text && !threadTs && (
        <blockquote className="whitespace-pre-line border-l-2 border-border pl-3 text-muted-foreground">
          {text}
        </blockquote>
      )}
      {channel && threadTs && (
        <SlackThreadContext channel={channel} thread_ts={threadTs} />
      )}
      {channel && (
        <SlackReplyComposer
          channel={channel}
          channelName={channelName}
          thread_ts={threadTs ?? ts}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
}

type SlackThreadMessage = {
  ts: string;
  user_id: string | null;
  user_name: string | null;
  text: string;
  is_self: boolean;
};

type SlackThreadResult =
  | { ok: true; messages: SlackThreadMessage[] }
  | { ok: false; error: string; needs_reauth?: boolean };

type SlackThreadLoader = (params: {
  channel: string;
  thread_ts: string;
}) => Promise<SlackThreadResult>;

const defaultSlackThreadLoader: SlackThreadLoader = async ({
  channel,
  thread_ts,
}) => {
  const qs = `channel=${encodeURIComponent(channel)}&thread_ts=${encodeURIComponent(
    thread_ts,
  )}`;
  return (await apiFetch(`/api/slack/thread?${qs}`)) as SlackThreadResult;
};

export function SlackThreadContext({
  channel,
  thread_ts,
  load = defaultSlackThreadLoader,
}: {
  channel: string;
  thread_ts: string;
  load?: SlackThreadLoader;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; messages: SlackThreadMessage[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ channel, thread_ts })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ kind: "ok", messages: out.messages });
        } else {
          setState({ kind: "error", message: out.error });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load thread",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [channel, thread_ts, load]);

  if (state.kind === "loading") {
    return <p className="text-xs text-muted-foreground">Loading thread…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-xs text-rose-700" role="alert">
        Couldn't load thread: {state.message}
      </p>
    );
  }
  if (state.messages.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Thread context"
      className="space-y-2 rounded-md border border-border bg-background p-3"
    >
      <header className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Thread
      </header>
      <ol className="space-y-2">
        {state.messages.map((m) => (
          <li
            key={m.ts}
            className={cn(
              "rounded px-2 py-1.5 text-xs",
              m.is_self ? "bg-muted" : "bg-muted/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">
                {m.user_name ?? (m.user_id ? `<@${m.user_id}>` : "(unknown)")}
                {m.is_self && (
                  <span className="ml-1 text-muted-foreground">(you)</span>
                )}
              </span>
              <time className="tabular-nums">{formatSlackTs(m.ts)}</time>
            </div>
            <p className="mt-0.5 whitespace-pre-line text-foreground">
              {m.text || "(empty message)"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatSlackTs(ts: string): string {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return ts;
  const d = new Date(seconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SlackReplySubmit = (params: {
  channel: string;
  text: string;
  thread_ts?: string;
  signal_id?: string;
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

const defaultSlackReplySubmit: SlackReplySubmit = async (params) =>
  (await apiFetch("/api/slack/reply", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

export function SlackReplyComposer({
  channel,
  channelName,
  thread_ts,
  signalId,
  submit = defaultSlackReplySubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  channel: string;
  channelName?: string;
  thread_ts?: string;
  signalId?: string;
  submit?: SlackReplySubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channelLabel = channelName ?? channel;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok" }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);
  // When the signal lives inside a thread, default to replying in-thread.
  const [asNewMessage, setAsNewMessage] = useState(false);
  const effectiveThreadTs = asNewMessage ? undefined : thread_ts;

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("slack");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setText(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    setPending(true);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        channel,
        text: text.trim(),
        thread_ts: effectiveThreadTs,
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok" });
        setText("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "reply failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reply failed",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-label="Slack reply composer"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          effectiveThreadTs
            ? "Reply in thread…"
            : `Send a message to #${channelLabel}`
        }
        aria-label="Slack reply"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      {thread_ts && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={asNewMessage}
            onChange={(e) => setAsNewMessage(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Send as a new message in #{channelLabel} (don't reply in thread)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || text.trim().length === 0}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">Reply sent.</output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize Slack"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}

export type MeetingAttendee = {
  email: string | null;
  name: string | null;
  response: string | null;
  organizer?: boolean;
};

export function MeetingDetail({ signal }: { signal: StoredSignal }) {
  const startsAt = signal.payload?.starts_at as string | undefined;
  const endsAt = signal.payload?.ends_at as string | undefined;
  const videoLink = signal.payload?.video_link as string | undefined;
  const organizer = signal.payload?.organizer as string | undefined;
  const description = (signal.payload?.description as string | null) ?? "";
  const agenda = parseAgenda(description);
  const attendees =
    (signal.payload?.attendees as MeetingAttendee[] | undefined) ?? [];
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
    <div data-slot="meeting-detail" className="mt-3 space-y-3 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {startsAt && (
          <>
            <dt className="text-muted-foreground">When</dt>
            <dd className="text-foreground">
              {formatMeetingTime(startsAt, endsAt)}
            </dd>
          </>
        )}
        {organizer && (
          <>
            <dt className="text-muted-foreground">Organizer</dt>
            <dd className="text-foreground">{organizer}</dd>
          </>
        )}
      </dl>
      {attendees.length > 0 && (
        <section aria-label="Attendees" className="flex items-center gap-3">
          <header
            className="font-bold uppercase tracking-wider"
            style={{ fontSize: 9, color: "var(--muted-foreground)" }}
          >
            Attendees
          </header>
          <AttendeeStack attendees={attendees} />
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {attendees.length}{" "}
            {attendees.length === 1 ? "attendee" : "attendees"}
          </span>
        </section>
      )}
      {agenda.length > 0 && (
        <section aria-label="Agenda">
          <header
            className="mb-2 font-bold uppercase tracking-wider"
            style={{ fontSize: 9, color: "var(--muted-foreground)" }}
          >
            Agenda
          </header>
          <ul className="ml-4 list-disc space-y-1 text-sm text-foreground">
            {agenda.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {videoLink && (
          <a
            href={videoLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-active"
          >
            <Video className="h-4 w-4" />
            Join meeting
          </a>
        )}
        {signal.url && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <CalIcon className="h-4 w-4" />
            Open invite
          </a>
        )}
      </div>
      {linkedItems.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Linked items
          </p>
          <ul className="mt-1 space-y-1">
            {linkedItems.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground underline hover:text-foreground/80"
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

export function AttendeeStack({
  attendees,
  max = 5,
}: {
  attendees: MeetingAttendee[];
  max?: number;
}) {
  const sorted = [...attendees].sort(byResponse);
  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;
  return (
    <div className="flex items-center" style={{ paddingLeft: 8 }}>
      {visible.map((a, i) => (
        <AttendeeAvatar
          key={attendeeKey(a, i)}
          attendee={a}
          stackedAfterFirst={i > 0}
        />
      ))}
      {overflow > 0 && (
        <span
          title={sorted
            .slice(max)
            .map((a) => attendeeLabel(a))
            .join(", ")}
          className="inline-flex items-center justify-center"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface-strong)",
            color: "var(--ink)",
            fontSize: 10,
            fontWeight: 600,
            border: "2px solid var(--canvas)",
            marginLeft: -8,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

function AttendeeAvatar({
  attendee,
  stackedAfterFirst,
}: {
  attendee: MeetingAttendee;
  stackedAfterFirst: boolean;
}) {
  const label = attendeeLabel(attendee);
  const opacity = attendee.response === "declined" ? 0.5 : 1;
  return (
    <span
      title={
        attendee.response && attendee.response !== "accepted"
          ? `${label} · ${attendee.response}`
          : label
      }
      data-response={attendee.response ?? undefined}
      className="inline-flex items-center justify-center"
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: avatarTint(label),
        color: "var(--ink)",
        fontSize: 10,
        fontWeight: 600,
        border: "2px solid var(--canvas)",
        marginLeft: stackedAfterFirst ? -8 : 0,
        opacity,
      }}
    >
      {initials(label)}
    </span>
  );
}

const ATTENDEE_TINTS = [
  "var(--src-git-bg)",
  "var(--src-slack-bg)",
  "var(--src-cal-bg)",
  "var(--src-task-bg)",
  "var(--src-ai-bg)",
];

function avatarTint(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return ATTENDEE_TINTS[Math.abs(h) % ATTENDEE_TINTS.length];
}

function attendeeKey(a: MeetingAttendee, i: number): string {
  return a.email ?? a.name ?? `idx-${i}`;
}

function attendeeLabel(a: MeetingAttendee): string {
  return a.name?.trim() || a.email?.trim() || "Guest";
}

function initials(label: string): string {
  const parts = label.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

function byResponse(a: MeetingAttendee, b: MeetingAttendee): number {
  const order: Record<string, number> = {
    accepted: 0,
    tentative: 1,
    needsAction: 2,
    declined: 3,
  };
  return (order[a.response ?? ""] ?? 4) - (order[b.response ?? ""] ?? 4);
}

function parseAgenda(description: string | undefined): string[] {
  if (!description) return [];
  return description
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter((l) => l.length > 0)
    .slice(0, 6);
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

function formatSnoozeReturn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SignalGroup = "pr" | "slack" | "meeting" | "ticket";

export function kindGroup(kind: SignalKind): SignalGroup {
  if (kind === "meeting") return "meeting";
  if (kind === "dm" || kind === "mention" || kind === "thread_reply")
    return "slack";
  if (
    kind === "ticket_assigned" ||
    kind === "ticket_in_progress" ||
    kind === "ticket_in_review" ||
    kind === "ticket_blocked"
  )
    return "ticket";
  return "pr";
}

export function secondaryLabel(s: Signal): string {
  if (s.provider === "slack") {
    const channelType = s.payload?.channel_type as string | undefined;
    const channel = s.payload?.channel as string | undefined;
    const channelName = s.payload?.channel_name as string | undefined;
    const author = s.payload?.author as string | undefined;
    const authorName = s.payload?.author_name as string | undefined;
    const where =
      channelType === "im"
        ? "DM"
        : channelName
          ? `#${channelName}`
          : channel
            ? `#${channel}`
            : "";
    const fromLabel = authorName
      ? `from ${authorName}`
      : author
        ? `from <@${author}>`
        : "";
    return [where, fromLabel].filter(Boolean).join(" · ");
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
  if (s.provider === "linear" || s.provider === "jira") {
    const identifier =
      (s.payload?.identifier as string | undefined) ?? s.source_id;
    const stateName = (s.payload?.state_name as string | undefined) ?? "";
    return [identifier, stateName].filter(Boolean).join(" · ");
  }
  const repo = (s.payload?.repo as string | undefined) ?? "";
  const number = s.payload?.number as number | undefined;
  const author = (s.payload?.author as string | undefined) ?? "";
  const additions = s.payload?.additions as number | undefined;
  const deletions = s.payload?.deletions as number | undefined;
  const repoCell = repo
    ? `${repo}${typeof number === "number" ? ` #${number}` : ""}`
    : "";
  const diffCell =
    typeof additions === "number" && typeof deletions === "number"
      ? `+${additions} −${deletions}`
      : "";
  return [repoCell, author && `${author}`, diffCell]
    .filter(Boolean)
    .join(" · ");
}
