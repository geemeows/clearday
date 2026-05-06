import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  ExternalLink,
  Inbox,
  RefreshCw,
  Sparkles,
  SquareKanban,
  Video,
  X,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BriefingResult } from "#/features/briefing/morning-briefing";
import { UpcomingEventsCard } from "#/features/signals/components/UpcomingEventsCard";
import type { MeetingEvent } from "#/features/signals/views/calendar";
import {
  computeWeekStats,
  filterMeetingsToToday,
  type NextUpMeeting,
  pickInboxPreview,
  pickInProgressTickets,
  pickMeetingForAlert,
  pickTodaySchedule,
  pickUpcoming,
  type WeekStats,
} from "#/features/signals/views/today";
import { apiFetch } from "#/lib/api-client";
import type { ProfileView } from "#/lib/profile-api";
import { useAutoRefresh } from "#/lib/use-auto-refresh";
import type { StoredSignal } from "#/shared/signal";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

function TodayPage() {
  const [meetings, setMeetings] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

  const reloadMeetings = useCallback(async () => {
    try {
      const body = (await apiFetch("/api/signals?filter=meetings")) as {
        signals: StoredSignal[];
      };
      setMeetings(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    reloadMeetings();
  }, [reloadMeetings]);
  useAutoRefresh(reloadMeetings);

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

  const upcoming = useMemo(
    () => (meetings ? pickUpcoming(meetings, now, 5) : []),
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

  const greeting = useGreeting(now);

  return (
    <TodayView
      meetings={meetings}
      upcoming={upcoming}
      error={error}
      alertSignal={alertSignal}
      onDismissAlert={dismissAlert}
      greeting={greeting}
      summary={
        <SummaryLine
          meetings={meetings}
          todaysMeetings={todaysMeetings}
          alertActive={activeAlertId != null}
        />
      }
      briefing={<BriefingCard />}
      schedule={
        meetings != null && <TodaySchedule events={todaysMeetings} now={now} />
      }
      inboxPreview={<InboxPreviewCard />}
      inProgress={<InProgressCard />}
      weekStats={<WeekStatsCard now={now} />}
    />
  );
}

export function TodayView({
  meetings,
  upcoming,
  error,
  alertSignal,
  onDismissAlert,
  greeting,
  summary,
  briefing,
  schedule,
  inboxPreview,
  inProgress,
  weekStats,
}: {
  meetings: StoredSignal[] | null;
  upcoming: NextUpMeeting[];
  error: string | null;
  alertSignal: StoredSignal | null;
  onDismissAlert: () => void;
  greeting?: string;
  summary?: ReactNode;
  briefing?: ReactNode;
  schedule?: ReactNode;
  inboxPreview?: ReactNode;
  inProgress?: ReactNode;
  weekStats?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl space-y-6 p-8">
      <header>
        <h1 className="font-semibold text-2xl text-foreground">
          {greeting ?? "Today"}
        </h1>
        {summary && (
          <p className="mt-1 text-muted-foreground text-sm">{summary}</p>
        )}
      </header>

      {error && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </p>
      )}

      {meetings == null && !error && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {meetings != null && <UpcomingEventsCard meetings={upcoming} />}

      {briefing}

      <div className="grid gap-6 md:grid-cols-2">
        {inboxPreview}
        {inProgress}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {schedule}
        {weekStats}
      </div>

      {alertSignal && (
        <MeetingAlertToast signal={alertSignal} onDismiss={onDismissAlert} />
      )}
    </section>
  );
}

// Placeholder hook backing the greeting + summary line. Reads display name
// from /api/profile and derives a time-of-day greeting from `now`.
function useGreeting(now: Date): string {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (apiFetch("/api/profile") as Promise<ProfileView>)
      .then((p) => {
        if (cancelled) return;
        setName(firstNameOf(p?.display_name));
      })
      .catch(() => {
        // Leave name null; greeting falls back to no first name.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return formatGreeting(now, name);
}

export function formatGreeting(now: Date, name: string | null): string {
  const h = now.getHours();
  const tod =
    h < 5
      ? "Up early"
      : h < 12
        ? "Good morning"
        : h < 18
          ? "Good afternoon"
          : "Good evening";
  return name ? `${tod}, ${name}` : tod;
}

function firstNameOf(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function SummaryLine({
  meetings,
  todaysMeetings,
  alertActive,
}: {
  meetings: StoredSignal[] | null;
  todaysMeetings: MeetingEvent[];
  alertActive: boolean;
}) {
  if (meetings == null) return null;
  const meetingCount = todaysMeetings.length;
  return (
    <>
      {meetingCount === 0
        ? "No meetings today"
        : `${meetingCount} ${plural(meetingCount, "meeting")} today`}
      {alertActive && " · meeting in 10 min"}
    </>
  );
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

type Generator = (force: boolean) => Promise<BriefingResult>;

export function BriefingCard({ generator }: { generator?: Generator } = {}) {
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
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
    const startedAt = Date.now();
    gen(false)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setLatencyMs(Date.now() - startedAt);
      })
      .catch((e) => {
        if (cancelled) return;
        setResult({
          ok: false,
          reason: "error",
          error: e instanceof Error ? e.message : String(e),
        });
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
    const startedAt = Date.now();
    try {
      const r = await gen(true);
      // Daily regenerate cap: keep the existing briefing visible and surface
      // an inline warning rather than replacing the cached text with the
      // fallback layout.
      if (!r.ok && r.reason === "regenerate_limit") {
        setRegenWarning("Daily regenerate limit reached. Try again tomorrow.");
      } else {
        setResult(r);
        setLatencyMs(Date.now() - startedAt);
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
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Sparkles className="h-4 w-4" />
          Morning briefing
        </div>
        <div className="flex items-center gap-2">
          {result?.ok && result.used_fallback && (
            <span className="inline-flex items-center rounded-sm border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-[11px] text-amber-800">
              Running on fallback model
            </span>
          )}
          {result?.ok && (
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2.5 py-1 text-foreground text-xs hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
        </div>
      </header>
      <div className="mt-3 text-foreground text-sm">
        {busy && !result && (
          <p className="text-muted-foreground">Generating your briefing…</p>
        )}
        {result?.ok && (
          <>
            <p className="whitespace-pre-line">{renderBold(result.text)}</p>
            <p className="mt-3 font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              {result.model.toUpperCase()}
              {latencyMs != null && ` · ${formatLatency(latencyMs)}`}
              {/* TODO(post-redesign): wire to real cost telemetry — see PRD #29 */}
              {" · $0.000"}
              {result.cached && " · cached"}
            </p>
            {regenWarning && (
              <p className="mt-2 text-amber-700 text-xs">{regenWarning}</p>
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

// Parses `**bold**` markers into <strong> nodes. Other characters pass
// through untouched. Pure helper, exported for tests.
export function renderBold(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <strong key={`b-${i}`} className="font-semibold">
        {match[1]}
      </strong>,
    );
    last = match.index + match[0].length;
    i += 1;
    match = re.exec(text);
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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
      <p className="text-muted-foreground">
        No AI provider configured. Add your API key in{" "}
        <a href="/settings" className="underline hover:text-foreground">
          Settings → AI provider
        </a>
        .
      </p>
    );
  }
  if (result.reason === "disabled") {
    return (
      <p className="text-muted-foreground">
        AI is disabled for this account. Enable it in{" "}
        <a href="/settings" className="underline hover:text-foreground">
          Settings
        </a>{" "}
        to see your briefing.
      </p>
    );
  }
  if (result.reason === "budget_reached") {
    return (
      <p className="text-muted-foreground">
        AI disabled — monthly budget reached.
      </p>
    );
  }
  if (result.reason === "regenerate_limit") {
    return (
      <p className="text-muted-foreground">
        Daily regenerate limit reached. Try again tomorrow.
      </p>
    );
  }
  return (
    <p className="text-destructive">
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
      className="fixed right-6 bottom-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground text-sm">
          Starts in 10 minutes
        </p>
        <p className="mt-0.5 truncate text-foreground text-sm">
          {signal.title}
        </p>
        {videoLink && (
          <a
            href={videoLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1 text-primary-foreground text-xs hover:opacity-90"
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
        className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </output>
  );
}

export function TodaySchedule({
  events,
  now,
}: {
  events: MeetingEvent[];
  now: Date;
}) {
  return (
    <article
      aria-label="Today schedule"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="text-muted-foreground text-xs uppercase tracking-wider">
        Today's schedule
      </header>
      {events.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">No meetings today.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {events.map((e) => {
            const isNow = isCurrentBlock(e, now);
            const focus = e.isFocus;
            return (
              <li
                key={e.signal.id}
                aria-current={isNow ? "true" : undefined}
                className={
                  focus
                    ? "flex items-start gap-3 bg-foreground py-2 px-2 text-background first:pt-2 last:pb-2"
                    : "flex items-start gap-3 py-2 first:pt-0 last:pb-0"
                }
              >
                <time
                  dateTime={e.startsAt.toISOString()}
                  className={
                    focus
                      ? "w-20 shrink-0 font-mono text-background/80 text-xs"
                      : "w-20 shrink-0 font-mono text-muted-foreground text-xs"
                  }
                >
                  {formatLocalTime(e.startsAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      focus
                        ? "truncate font-medium text-background text-sm"
                        : "truncate font-medium text-foreground text-sm"
                    }
                  >
                    {e.signal.title}
                  </p>
                </div>
                {isNow && (
                  <span className="inline-flex items-center rounded-sm bg-primary px-1.5 py-0.5 font-semibold text-[10px] text-primary-foreground uppercase tracking-wider">
                    NOW
                  </span>
                )}
                {!isNow && e.videoLink && (
                  <a
                    href={e.videoLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
                  >
                    <Video className="h-3 w-3" />
                    Join
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function isCurrentBlock(e: MeetingEvent, now: Date): boolean {
  const t = now.getTime();
  return e.startsAt.getTime() <= t && t < e.endsAt.getTime();
}

// Placeholder hook used by the schedule card; backend lands in a follow-up
// issue, hence the loader is a thin pass-through over /api/signals.
// TODO(post-redesign): replace with a real schedule source once the
// calendar provider is wired — see PRD #29.
export function useTodaySchedule(): {
  events: MeetingEvent[] | null;
  error: string | null;
} {
  // Intentionally a thin wrapper; today's schedule is derived in TodayPage
  // above. Exposed for future callers and tests.
  return { events: null, error: null };
}

type InboxLoader = () => Promise<StoredSignal[]>;

const defaultInboxLoader: InboxLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=all")) as {
    signals: StoredSignal[];
  };
  return filterMeetingsToToday(body.signals);
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

  const reload = useCallback(async () => {
    try {
      const list = await loader();
      setSignals(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, [loader]);

  useEffect(() => {
    reload();
  }, [reload]);
  useAutoRefresh(reload);

  const preview = useMemo(
    () => (signals ? pickInboxPreview(signals, limit) : []),
    [signals, limit],
  );

  return (
    <article
      aria-label="Inbox preview"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Inbox className="h-4 w-4" />
          Needs you
        </div>
        <a
          href="/inbox"
          className="text-foreground text-xs underline hover:text-primary"
        >
          Open all
        </a>
      </header>
      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
      {!error && signals == null && (
        <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && signals != null && preview.length === 0 && (
        <p className="mt-3 text-muted-foreground text-sm">
          Nothing actionable. Inbox zero.
        </p>
      )}
      {!error && preview.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {preview.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground text-sm">
                  {s.title}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {s.provider}
                </p>
              </span>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
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

// TODO(post-redesign): replace the GitHub PR / ticket signal fetch with the
// dedicated Linear/Jira adapter once it lands — see PRD #29.
export function useInProgressTickets(
  loader: TicketLoader = defaultTicketLoader,
): {
  tickets: StoredSignal[] | null;
  error: string | null;
} {
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
  return { tickets, error };
}

export function InProgressCard({
  loader = defaultTicketLoader,
  limit = 5,
}: {
  loader?: TicketLoader;
  limit?: number;
} = {}) {
  const { tickets, error } = useInProgressTickets(loader);

  const top = useMemo(
    () => (tickets ? pickInProgressTickets(tickets, limit) : []),
    [tickets, limit],
  );

  return (
    <article
      aria-label="In progress"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <SquareKanban className="h-4 w-4" />
        In progress
      </header>
      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
      {!error && tickets == null && (
        <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && tickets != null && top.length === 0 && (
        <p className="mt-3 text-muted-foreground text-sm">
          Nothing in progress. Connect Linear or Jira in{" "}
          <a href="/settings" className="underline hover:text-foreground">
            Settings
          </a>
          .
        </p>
      )}
      {!error && top.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {top.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="rounded-sm bg-secondary px-2 py-0.5 font-mono text-foreground text-xs">
                {TICKET_STATUS_LABEL[s.kind] ?? s.kind}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
                {s.title}
              </span>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
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

// Placeholder trend deltas. Real prev-week comparison lands with the
// follow-up retrospective backend.
// TODO(post-redesign): wire to real prev-week comparison data — see PRD #29.
const PLACEHOLDER_TRENDS: Record<keyof WeekStats, number> = {
  prsReviewed: 2,
  ticketsShipped: 1,
  focusHours: -1,
  inboxZeroedDays: 0,
};

// TODO(post-redesign): replace the per-week signals fetch with a dedicated
// retrospective endpoint that returns both current + prev counts — see PRD #29.
export function useWeekStats(
  now: Date,
  loader: WeekLoader = defaultWeekLoader,
): {
  stats: WeekStats | null;
  trends: Record<keyof WeekStats, number>;
  error: string | null;
} {
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

  return { stats, trends: PLACEHOLDER_TRENDS, error };
}

export function WeekStatsCard({
  now,
  loader = defaultWeekLoader,
}: {
  now: Date;
  loader?: WeekLoader;
}) {
  const { stats, trends, error } = useWeekStats(now, loader);

  return (
    <article
      aria-label="This week"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <BarChart3 className="h-4 w-4" />
        This week
      </header>
      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
      {!error && stats == null && (
        <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && stats != null && (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="PRs reviewed"
            value={stats.prsReviewed}
            delta={trends.prsReviewed}
          />
          <Stat
            label="Tickets shipped"
            value={stats.ticketsShipped}
            delta={trends.ticketsShipped}
          />
          <Stat
            label="Focus hours"
            value={stats.focusHours}
            delta={trends.focusHours}
          />
          <Stat
            label="Inbox zeroed days"
            value={stats.inboxZeroedDays}
            delta={trends.inboxZeroedDays}
          />
        </dl>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta: number;
}) {
  return (
    <div className="rounded-sm border border-border bg-secondary/40 px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="font-semibold text-foreground text-lg">{value}</span>
        <TrendDelta delta={delta} />
      </dd>
    </div>
  );
}

function TrendDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span data-trend="flat" className="text-muted-foreground text-xs">
        ±0
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      data-trend={positive ? "up" : "down"}
      className={
        positive
          ? "font-medium text-emerald-600 text-xs"
          : "font-medium text-destructive text-xs"
      }
    >
      {positive ? "↑" : "↓"}
      {positive ? "+" : ""}
      {delta}
    </span>
  );
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
