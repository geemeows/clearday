import { createFileRoute } from "@tanstack/react-router";
import { Calendar as CalIcon, ExternalLink, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SourceGlyph, type SourceKind } from "#/components/SourceGlyph";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import { filterMeetingsToToday } from "#/lib/today-window";
import { useAutoRefresh } from "#/lib/use-auto-refresh";
import type { Signal, SignalKind, SignalProvider } from "#/shared/signal";

export const Route = createFileRoute("/_app/inbox")({
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

function InboxPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repliedIds, setRepliedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async (includeSnoozed: boolean) => {
    try {
      // Always fetch the full set so filter chips can render live counts.
      // Filter selection is applied client-side in InboxView.
      const qs = includeSnoozed
        ? "filter=all&include_snoozed=true"
        : "filter=all";
      const body = (await apiFetch(`/api/signals?${qs}`)) as {
        signals: StoredSignal[];
      };
      setSignals(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    reload(showSnoozed);
  }, [showSnoozed, reload]);

  const refresh = useCallback(() => {
    reload(showSnoozed);
  }, [showSnoozed, reload]);
  useAutoRefresh(refresh);

  const dismiss = useCallback(
    async (id: string) => {
      setSignals((current) => current?.filter((s) => s.id !== id) ?? null);
      setSelectedId((prev) => (prev === id ? null : prev));
      setRepliedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await apiFetch(`/api/signals/${id}/dismiss`, { method: "POST" });
      reload(showSnoozed);
    },
    [showSnoozed, reload],
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
      showSnoozed={showSnoozed}
      onShowSnoozedChange={setShowSnoozed}
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
  showSnoozed = false,
  onShowSnoozedChange,
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
  showSnoozed?: boolean;
  onShowSnoozedChange?: (v: boolean) => void;
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
  return (
    <section className="flex h-full min-h-0 flex-col p-8">
      <header>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Unified Signals from your sources.
        </p>
      </header>

      <nav
        aria-label="Inbox filters"
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.id}
            aria-pressed={filter === f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.id
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {f.label}
            {counts && (
              <span
                data-slot="filter-count"
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-px text-[10px] tabular-nums",
                  filter === f.id
                    ? "bg-background/20 text-background"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
        <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showSnoozed}
            onChange={(e) => onShowSnoozedChange?.(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Show snoozed
        </label>
      </nav>

      {error && (
        <p className="mt-6 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {visible == null && !error && (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      )}

      {visible && visible.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing here. New Signals show up automatically.
        </p>
      )}

      {visible && visible.length > 0 && (
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
          <ul className="flex min-h-0 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
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
          <InboxDetailPane
            signal={selected}
            onClose={() => onSelect?.(null)}
            onDismiss={onDismiss}
            onReplyStart={onReplyStart}
            onReplyRollback={onReplyRollback}
          />
        </div>
      )}
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
  onDismiss: () => void;
  nowIso: string;
}) {
  const severity = severityOf(signal);
  const isAutoRule = signal.payload?.badge === "auto-rule";
  const unread =
    typeof signal.unread_count === "number" && signal.unread_count > 0
      ? signal.unread_count
      : null;
  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        "relative flex items-center gap-3 px-4 py-3",
        // Rausch left-border accent on selected row (mockup #2).
        "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-primary before:opacity-0",
        selected && "bg-muted/40 before:opacity-100",
        (replied || snoozed) && "opacity-60",
      )}
    >
      <SourceGlyph source={providerToSource(signal.provider)} size={28} />
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          {unread && (
            <span
              role="img"
              data-slot="unread"
              aria-label={`${unread} unread`}
              className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
          )}
          <div className="truncate text-sm font-medium text-foreground">
            {signal.title}
          </div>
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
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {kindLabel(signal.kind)} · {secondaryLabel(signal)}
          </span>
          <time className="shrink-0 tabular-nums">
            {relAgo(signal.source_created_at, nowIso)}
          </time>
        </div>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
      >
        Dismiss
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
  const toneClass =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      data-slot="severity-chip"
      data-tone={tone}
      title={title}
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        toneClass,
        className,
      )}
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
        className="hidden items-center justify-center rounded-md border border-dashed border-border bg-card p-5 text-sm text-muted-foreground lg:flex"
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
      className="rounded-md border border-border bg-card p-5"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SourceGlyph source={providerToSource(signal.provider)} size={28} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {kindLabel(signal.kind)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <h2 className="mt-3 text-base font-semibold text-foreground">
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
      <div className="mt-5 flex flex-wrap gap-2">
        {/* MeetingDetail carries its own Join meeting / Open invite buttons. */}
        {signal.url && group !== "meeting" && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary-active"
          >
            <ExternalLink className="h-4 w-4" />
            {openLabel(signal.provider)}
          </a>
        )}
        <button
          type="button"
          onClick={() => onDismiss(signal.id)}
          className="rounded border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          Dismiss
        </button>
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
          className="rounded-md border border-border bg-muted/40 p-3"
        >
          <header className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            AI summary
          </header>
          <p className="whitespace-pre-line text-sm text-foreground">
            {aiSummary}
          </p>
        </section>
      )}
      {filesChanged.length > 0 && (
        <section aria-label="Files changed">
          <header className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Files changed
          </header>
          <ul className="divide-y divide-border rounded-md border border-border">
            {filesChanged.map((f) => (
              <li
                key={f.path}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
              >
                <span className="truncate font-mono text-foreground">
                  {f.path}
                </span>
                <span className="shrink-0 font-mono">
                  {typeof f.additions === "number" && (
                    <span className="text-emerald-600">+{f.additions}</span>
                  )}
                  {typeof f.additions === "number" &&
                    typeof f.deletions === "number" && <span> </span>}
                  {typeof f.deletions === "number" && (
                    <span className="text-destructive">-{f.deletions}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {recentComments.length > 0 && (
        <section aria-label="Recent comments">
          <header className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent comments
          </header>
          <ol className="space-y-2">
            {recentComments.map((c, i) => (
              <li
                key={`${c.author}-${c.created_at ?? i}`}
                className="rounded-md border border-border bg-background p-2 text-xs"
              >
                <div className="font-medium text-foreground">@{c.author}</div>
                <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                  {c.body}
                </p>
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

export function MeetingDetail({ signal }: { signal: StoredSignal }) {
  const startsAt = signal.payload?.starts_at as string | undefined;
  const endsAt = signal.payload?.ends_at as string | undefined;
  const videoLink = signal.payload?.video_link as string | undefined;
  const organizer = signal.payload?.organizer as string | undefined;
  const description = signal.payload?.description as string | undefined;
  const agenda = parseAgenda(description);
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
      {agenda.length > 0 && (
        <section aria-label="Agenda">
          <header className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
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

function providerToSource(provider: SignalProvider): SourceKind {
  if (provider === "github") return "git";
  if (provider === "slack") return "slack";
  if (provider === "google") return "cal";
  // linear / jira
  return "task";
}

function openLabel(provider: SignalProvider): string {
  if (provider === "github") return "Open in GitHub";
  if (provider === "slack") return "Open in Slack";
  if (provider === "linear") return "Open in Linear";
  if (provider === "jira") return "Open in Jira";
  return "Open in Calendar";
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

function secondaryLabel(s: StoredSignal): string {
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
  const author = (s.payload?.author as string | undefined) ?? "";
  return [repo, author && `by @${author}`].filter(Boolean).join(" · ");
}
