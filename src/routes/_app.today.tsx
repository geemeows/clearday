import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Calendar as CalIcon,
  ExternalLink,
  Inbox,
  RefreshCw,
  Sparkles,
  SquareKanban,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import type { MeetingEvent } from "#/lib/calendar-view";
import type { BriefingResult } from "#/lib/morning-briefing";
import {
  formatCountdown,
  type LinkedItem,
  type NextUpMeeting,
  pickMeetingForAlert,
  pickNextUp,
  type StoredSignal,
} from "#/lib/next-up";
import {
  computeWeekStats,
  pickInboxPreview,
  pickInProgressTickets,
  pickTodaySchedule,
  type WeekStats,
} from "#/lib/today-cards";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

function TodayPage() {
  const [meetings, setMeetings] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=meetings")
      .then((body) => {
        if (cancelled) return;
        const list = (body as { signals: StoredSignal[] }).signals;
        setMeetings(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick once per minute so the countdown stays fresh and the 10-min alert
  // window is checked each minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fire the 10-min alert at most once per Signal across reloads / sessions.
  useEffect(() => {
    if (!meetings) return;
    const due = pickMeetingForAlert(meetings, now);
    if (!due) return;
    if (alertAlreadyFired(due.id)) return;
    markAlertFired(due.id);
    setActiveAlertId(due.id);
  }, [meetings, now]);

  const nextUp = useMemo(
    () => (meetings ? pickNextUp(meetings, now) : null),
    [meetings, now],
  );

  const dismissAlert = useCallback(() => setActiveAlertId(null), []);

  const alertSignal = useMemo(
    () => meetings?.find((m) => m.id === activeAlertId) ?? null,
    [meetings, activeAlertId],
  );

  const todaysMeetings = useMemo(
    () => (meetings ? pickTodaySchedule(meetings, now) : []),
    [meetings, now],
  );

  return (
    <TodayView
      meetings={meetings}
      nextUp={nextUp}
      now={now}
      error={error}
      alertSignal={alertSignal}
      onDismissAlert={dismissAlert}
      briefing={<BriefingCard />}
      schedule={
        meetings != null && (
          <TodayScheduleCard events={todaysMeetings} now={now} />
        )
      }
      inboxPreview={<InboxPreviewCard />}
      inProgress={<InProgressCard />}
      weekStats={<WeekStatsCard now={now} />}
    />
  );
}

export function TodayView({
  meetings,
  nextUp,
  now,
  error,
  alertSignal,
  onDismissAlert,
  briefing,
  schedule,
  inboxPreview,
  inProgress,
  weekStats,
}: {
  meetings: StoredSignal[] | null;
  nextUp: NextUpMeeting | null;
  now: Date;
  error: string | null;
  alertSignal: StoredSignal | null;
  onDismissAlert: () => void;
  briefing?: React.ReactNode;
  schedule?: React.ReactNode;
  inboxPreview?: React.ReactNode;
  inProgress?: React.ReactNode;
  weekStats?: React.ReactNode;
}) {
  return (
    <section className="p-8">
      <header>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your morning briefing, in-progress work, schedule, and inbox detail
          will live here.
        </p>
      </header>

      {error && (
        <p className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {meetings == null && !error && (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      )}

      {briefing}

      {meetings != null && <NextUpCard meeting={nextUp} now={now} />}

      {schedule}

      {inProgress}

      {inboxPreview}

      {weekStats}

      {alertSignal && (
        <MeetingAlertToast signal={alertSignal} onDismiss={onDismissAlert} />
      )}
    </section>
  );
}

export function NextUpCard({
  meeting,
  now,
}: {
  meeting: NextUpMeeting | null;
  now: Date;
}) {
  if (!meeting) {
    return (
      <div className="mt-6 rounded border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Next up</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nothing on your calendar in the next 24 hours.
        </p>
      </div>
    );
  }
  return (
    <article
      aria-label="Next up"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <CalIcon className="h-4 w-4" />
        Next up · {formatCountdown(meeting.startsAt, now)}
      </header>
      <h2 className="mt-2 text-lg font-semibold text-zinc-900">
        {meeting.signal.title}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {formatLocalTime(meeting.startsAt)}
        {meeting.endsAt && ` – ${formatLocalTime(meeting.endsAt)}`}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {meeting.videoLink && (
          <a
            href={meeting.videoLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            <Video className="h-4 w-4" />
            Join
          </a>
        )}
        {meeting.signal.url && (
          <a
            href={meeting.signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Calendar
          </a>
        )}
      </div>
      {meeting.linkedItems.length > 0 && (
        <ul aria-label="Linked items" className="mt-4 space-y-1">
          {meeting.linkedItems.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-700 underline hover:text-zinc-900"
              >
                {linkedLabel(item)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

type Generator = (force: boolean) => Promise<BriefingResult>;

export function BriefingCard({ generator }: { generator?: Generator } = {}) {
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenWarning, setRegenWarning] = useState<string | null>(null);

  const gen = useMemo<Generator>(
    () =>
      generator ??
      ((force: boolean) =>
        apiFetch("/api/briefing/generate", {
          method: "POST",
          body: { force },
        }) as Promise<BriefingResult>),
    [generator],
  );

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    gen(false)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setResult({
            ok: false,
            reason: "error",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gen]);

  const regenerate = useCallback(async () => {
    setBusy(true);
    setRegenWarning(null);
    try {
      const r = await gen(true);
      // Daily regenerate cap: keep the existing briefing visible and surface
      // an inline warning rather than replacing the cached text with the
      // fallback layout.
      if (!r.ok && r.reason === "regenerate_limit") {
        setRegenWarning("Daily regenerate limit reached. Try again tomorrow.");
      } else {
        setResult(r);
      }
    } catch (e) {
      setResult({
        ok: false,
        reason: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [gen]);

  return (
    <article
      aria-label="Morning briefing"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <Sparkles className="h-4 w-4" />
          Morning briefing
        </div>
        <div className="flex items-center gap-2">
          {result?.ok && result.used_fallback && (
            <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              Running on fallback model
            </span>
          )}
          {result?.ok && (
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
        </div>
      </header>
      <div className="mt-3 text-sm text-zinc-800">
        {busy && !result && (
          <p className="text-zinc-500">Generating your briefing…</p>
        )}
        {result?.ok && (
          <>
            <p className="whitespace-pre-line">{result.text}</p>
            <p className="mt-3 text-xs text-zinc-500">
              {result.provider} · {result.model}
              {result.cached && " · cached for today"}
            </p>
            {regenWarning && (
              <p className="mt-2 text-xs text-amber-700">{regenWarning}</p>
            )}
          </>
        )}
        {result?.ok === false && (
          <BriefingFallback result={result} busy={busy} />
        )}
      </div>
    </article>
  );
}

function BriefingFallback({
  result,
  busy,
}: {
  result: Extract<BriefingResult, { ok: false }>;
  busy: boolean;
}) {
  if (result.reason === "no_provider") {
    return (
      <p className="text-zinc-600">
        No AI provider configured. Add your API key in{" "}
        <a href="/settings" className="underline hover:text-zinc-900">
          Settings → AI provider
        </a>
        .
      </p>
    );
  }
  if (result.reason === "disabled") {
    return (
      <p className="text-zinc-600">
        AI is disabled for this account. Enable it in{" "}
        <a href="/settings" className="underline hover:text-zinc-900">
          Settings
        </a>{" "}
        to see your briefing.
      </p>
    );
  }
  if (result.reason === "budget_reached") {
    return (
      <p className="text-zinc-600">AI disabled — monthly budget reached.</p>
    );
  }
  if (result.reason === "regenerate_limit") {
    return (
      <p className="text-zinc-600">
        Daily regenerate limit reached. Try again tomorrow.
      </p>
    );
  }
  return (
    <p className="text-red-700">
      Couldn't generate briefing{result.error ? `: ${result.error}` : ""}.
      {busy && " Retrying…"}
    </p>
  );
}

function MeetingAlertToast({
  signal,
  onDismiss,
}: {
  signal: StoredSignal;
  onDismiss: () => void;
}) {
  const videoLink = (signal.payload?.video_link as string | undefined) ?? null;
  return (
    <output
      aria-label="Meeting starting soon"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg"
    >
      <CalIcon className="mt-0.5 h-5 w-5 text-zinc-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          Starts in 10 minutes
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-700">{signal.title}</p>
        {videoLink && (
          <a
            href={videoLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs text-white hover:bg-zinc-800"
          >
            <Video className="h-3 w-3" />
            Join
          </a>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss alert"
        onClick={onDismiss}
        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="h-4 w-4" />
      </button>
    </output>
  );
}

export function TodayScheduleCard({
  events,
  now,
}: {
  events: MeetingEvent[];
  now: Date;
}) {
  return (
    <article
      aria-label="Today schedule"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <CalIcon className="h-4 w-4" />
        Today's schedule
      </header>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No meetings today.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {events.map((e) => (
            <li
              key={e.signal.id}
              className="flex items-start gap-3 py-2 first:pt-0 last:pb-0"
            >
              <time
                dateTime={e.startsAt.toISOString()}
                className="w-20 shrink-0 text-sm text-zinc-500"
              >
                {formatLocalTime(e.startsAt)}
              </time>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {e.signal.title}
                </p>
                {e.endsAt && (
                  <p className="text-xs text-zinc-500">
                    {formatRange(e.startsAt, e.endsAt, now)}
                  </p>
                )}
              </div>
              {e.videoLink && (
                <a
                  href={e.videoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  <Video className="h-3 w-3" />
                  Join
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

type InboxLoader = () => Promise<StoredSignal[]>;

const defaultInboxLoader: InboxLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=all")) as {
    signals: StoredSignal[];
  };
  return body.signals;
};

export function InboxPreviewCard({
  loader = defaultInboxLoader,
  limit = 5,
}: {
  loader?: InboxLoader;
  limit?: number;
} = {}) {
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((list) => {
        if (cancelled) return;
        setSignals(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  const preview = useMemo(
    () => (signals ? pickInboxPreview(signals, limit) : []),
    [signals, limit],
  );

  return (
    <article
      aria-label="Inbox preview"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <Inbox className="h-4 w-4" />
          Inbox
        </div>
        <a
          href="/inbox"
          className="text-xs text-zinc-700 underline hover:text-zinc-900"
        >
          Open all
        </a>
      </header>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!error && signals == null && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}
      {!error && signals != null && preview.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing actionable. Inbox zero.
        </p>
      )}
      {!error && preview.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {preview.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {s.title}
                </p>
                <p className="truncate text-xs text-zinc-500">{s.provider}</p>
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

type TicketLoader = () => Promise<StoredSignal[]>;

const defaultTicketLoader: TicketLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=tickets")) as {
    signals: StoredSignal[];
  };
  return body.signals;
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  ticket_in_progress: "In progress",
  ticket_in_review: "In review",
  ticket_blocked: "Blocked",
  ticket_assigned: "Assigned",
};

export function InProgressCard({
  loader = defaultTicketLoader,
  limit = 5,
}: {
  loader?: TicketLoader;
  limit?: number;
} = {}) {
  const [tickets, setTickets] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((list) => {
        if (cancelled) return;
        setTickets(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  const top = useMemo(
    () => (tickets ? pickInProgressTickets(tickets, limit) : []),
    [tickets, limit],
  );

  return (
    <article
      aria-label="In progress"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <SquareKanban className="h-4 w-4" />
        In progress
      </header>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!error && tickets == null && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}
      {!error && tickets != null && top.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing in progress. Connect Linear or Jira in{" "}
          <a href="/settings" className="underline hover:text-zinc-900">
            Settings
          </a>
          .
        </p>
      )}
      {!error && top.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-100">
          {top.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700">
                {TICKET_STATUS_LABEL[s.kind] ?? s.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                {s.title}
              </span>
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
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

type WeekLoader = (since: string) => Promise<StoredSignal[]>;

const defaultWeekLoader: WeekLoader = async (since) => {
  const body = (await apiFetch(
    `/api/signals?filter=all&include_dismissed=true&since=${encodeURIComponent(since)}&limit=200`,
  )) as { signals: StoredSignal[] };
  return body.signals;
};

export function WeekStatsCard({
  now,
  loader = defaultWeekLoader,
}: {
  now: Date;
  loader?: WeekLoader;
}) {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stabilise the `since` ISO so the effect doesn't refetch every render
  // when callers pass a fresh `now` from a 1-minute tick.
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
      aria-label="This week"
      className="mt-6 rounded border border-zinc-200 bg-white p-5"
    >
      <header className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <BarChart3 className="h-4 w-4" />
        This week
      </header>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!error && stats == null && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}
      {!error && stats != null && (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="PRs reviewed" value={stats.prsReviewed} />
          <Stat label="Tickets shipped" value={stats.ticketsShipped} />
          <Stat label="Mentions handled" value={stats.mentionsHandled} />
          <Stat label="Meetings" value={stats.meetingsAttended} />
        </dl>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-100 bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function formatRange(start: Date, end: Date, _now: Date): string {
  return `${formatLocalTime(start)} – ${formatLocalTime(end)}`;
}

function linkedLabel(item: LinkedItem): string {
  if (item.kind === "pr") return `${item.repo}#${item.number}`;
  return item.key;
}

function formatLocalTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ALERT_STORAGE_PREFIX = "clearday:meeting-alert:";

function alertAlreadyFired(id: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(ALERT_STORAGE_PREFIX + id) != null;
  } catch {
    return false;
  }
}

function markAlertFired(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ALERT_STORAGE_PREFIX + id, String(Date.now()));
  } catch {
    // best-effort; if storage is full or disabled, the next render will
    // simply re-fire (the inner `setActiveAlertId` is also idempotent in
    // the active session).
  }
}
