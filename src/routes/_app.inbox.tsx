import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar as CalIcon,
  ExternalLink,
  Github,
  Slack,
  SquareKanban,
  Trello,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { Signal, SignalKind, SignalProvider } from "#/lib/signal";
import { filterMeetingsToToday } from "#/lib/today-window";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

type StoredSignal = Signal & {
  id: string;
  dismissed_at: string | null;
  priority?: "low" | "high" | null;
  snoozed_until?: string | null;
};

type Filter = "all" | "prs" | "tickets" | "mentions" | "meetings";

const FILTERS: Array<{ id: Filter; label: string; enabled: boolean }> = [
  { id: "all", label: "All", enabled: true },
  { id: "prs", label: "PRs", enabled: true },
  { id: "tickets", label: "Tickets", enabled: true },
  { id: "mentions", label: "Mentions", enabled: true },
  { id: "meetings", label: "Meetings", enabled: true },
];

function InboxPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repliedIds, setRepliedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(
    async (current: Filter, includeSnoozed: boolean) => {
      try {
        const qs = includeSnoozed
          ? `filter=${current}&include_snoozed=true`
          : `filter=${current}`;
        const body = (await apiFetch(`/api/signals?${qs}`)) as {
          signals: StoredSignal[];
        };
        setSignals(body.signals);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed to load");
      }
    },
    [],
  );

  useEffect(() => {
    reload(filter, showSnoozed);
  }, [filter, showSnoozed, reload]);

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
      reload(filter, showSnoozed);
    },
    [filter, showSnoozed, reload],
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

  // The cron ingests a 30-day window so Calendar can render Week/Month, but
  // the Inbox is for "what's happening now/next". Always restrict meetings
  // (on any tab) to today; non-meeting signals are unaffected.
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

      <nav
        aria-label="Inbox filters"
        className="mt-4 flex flex-wrap items-center gap-2"
      >
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
        <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={showSnoozed}
            onChange={(e) => onShowSnoozedChange?.(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300"
          />
          Show snoozed
        </label>
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
            {signals.map((s) => {
              const replied = repliedIds?.has(s.id) ?? false;
              const snoozed = !!s.snoozed_until && s.snoozed_until > nowIso;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    selectedId === s.id && "bg-zinc-50",
                    (replied || snoozed) && "opacity-60",
                  )}
                >
                  <ProviderBadge provider={s.provider} />
                  <button
                    type="button"
                    onClick={() => onSelect?.(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-zinc-900">
                        {s.title}
                      </div>
                      {replied && (
                        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                          Replied
                        </span>
                      )}
                      {s.priority === "high" && (
                        <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                          High
                        </span>
                      )}
                      {s.priority === "low" && (
                        <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Low
                        </span>
                      )}
                      {snoozed && (
                        <span
                          className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                          title={`Returns at ${formatSnoozeReturn(s.snoozed_until)}`}
                        >
                          Snoozed · returns{" "}
                          {formatSnoozeReturn(s.snoozed_until)}
                        </span>
                      )}
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
              );
            })}
          </ul>
          {selected && (
            <InboxDetailPane
              signal={selected}
              onClose={() => onSelect?.(null)}
              onDismiss={onDismiss}
              onReplyStart={onReplyStart}
              onReplyRollback={onReplyRollback}
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
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
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
      <DetailBody
        signal={signal}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />
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

function DetailBody({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const group = kindGroup(signal.kind);
  if (group === "pr")
    return (
      <PrBody
        signal={signal}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />
    );
  if (group === "slack")
    return (
      <SlackBody
        signal={signal}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
      />
    );
  if (group === "ticket") return <TicketBody signal={signal} />;
  return <MeetingBody signal={signal} />;
}

function TicketBody({ signal }: { signal: StoredSignal }) {
  const identifier = signal.payload?.identifier as string | undefined;
  const stateName = signal.payload?.state_name as string | undefined;
  const priority = signal.payload?.priority_label as string | undefined;
  const teamKey = signal.payload?.team_key as string | undefined;
  return (
    <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
      {identifier && (
        <>
          <dt className="text-zinc-500">Ticket</dt>
          <dd className="font-mono text-zinc-900">{identifier}</dd>
        </>
      )}
      {teamKey && (
        <>
          <dt className="text-zinc-500">Team</dt>
          <dd className="text-zinc-900">{teamKey}</dd>
        </>
      )}
      {stateName && (
        <>
          <dt className="text-zinc-500">Status</dt>
          <dd className="text-zinc-900">{stateName}</dd>
        </>
      )}
      {priority && (
        <>
          <dt className="text-zinc-500">Priority</dt>
          <dd className="text-zinc-900">{priority}</dd>
        </>
      )}
    </dl>
  );
}

function PrBody({
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
  const draft = Boolean(signal.payload?.draft);
  return (
    <div className="mt-3 space-y-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
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
      className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment (required for Request changes / Comment)"
        aria-label="Review comment"
        rows={3}
        className="w-full resize-y rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400"
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
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-60"
        >
          {pending === "COMMENT" ? "Sending…" : "Comment"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending !== null}
            className="ml-auto rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
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

function SlackBody({
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
    <div className="mt-3 space-y-4 text-sm">
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
            <dd className="text-zinc-900">
              {authorName ? authorName : `<@${author}>`}
            </dd>
          </>
        )}
      </dl>
      {text && (
        <blockquote className="whitespace-pre-line border-l-2 border-zinc-200 pl-3 text-zinc-700">
          {text}
        </blockquote>
      )}
      {channel && (
        <SlackReplyComposer
          channel={channel}
          thread_ts={threadTs ?? ts}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
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
  thread_ts?: string;
  signalId?: string;
  submit?: SlackReplySubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok" }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);

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
        thread_ts,
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
      className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          thread_ts ? "Reply in thread…" : `Send a message to #${channel}`
        }
        aria-label="Slack reply"
        rows={3}
        className="w-full resize-y rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || text.trim().length === 0}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            className="ml-auto rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
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

function kindGroup(kind: SignalKind): "pr" | "slack" | "meeting" | "ticket" {
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

function openLabel(provider: SignalProvider): string {
  if (provider === "github") return "Open in GitHub";
  if (provider === "slack") return "Open in Slack";
  if (provider === "linear") return "Open in Linear";
  if (provider === "jira") return "Open in Jira";
  return "Open in Calendar";
}

function ProviderBadge({ provider }: { provider: SignalProvider }) {
  const Icon =
    provider === "github"
      ? Github
      : provider === "slack"
        ? Slack
        : provider === "linear"
          ? SquareKanban
          : provider === "jira"
            ? Trello
            : CalIcon;
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
