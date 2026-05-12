import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw, Sparkles, Video, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button as CossButton } from "#/components/coss/button";
import type { BriefingResult } from "#/features/briefing/morning-briefing";
import type { MeetingEvent } from "#/features/calendar/events";
import {
  decideOnboardingGate,
  type OnboardingStatus,
} from "#/features/onboarding/api";
import { type DueCard, listCardsDueOn } from "#/features/projects/store";
import type { ProfileView } from "#/features/settings/profile/api";
import { InboxPreviewRow } from "#/features/signals/components/InboxPreviewRow";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { daysInProgress, prRefOf } from "#/features/signals/display";
import {
  filterMeetingsToToday,
  pickInboxPreview,
  pickInProgressTickets,
  pickMeetingForAlert,
  pickNextUp,
  pickTodaySchedule,
} from "#/features/signals/views/today";
import { NextUpHero } from "#/features/today/NextUpHero";
import { PulseCard } from "#/features/today/PulseCard";
import { useAutoRefresh } from "#/hooks/use-auto-refresh";
import { useDismissedAlerts } from "#/hooks/useDismissedAlerts";
import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
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

  const { alertAlreadyFired, markAlertFired } = useDismissedAlerts();

  // Fire the 10-min alert at most once per Signal across reloads / sessions.
  useEffect(() => {
    if (!meetings) return;
    const due = pickMeetingForAlert(meetings, now);
    if (!due) return;
    if (alertAlreadyFired(due.id)) return;
    markAlertFired(due.id);
    setActiveAlertId(due.id);
  }, [meetings, now, alertAlreadyFired, markAlertFired]);

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

  const greeting = useGreeting(now);

  return (
    <TodayView
      meetings={meetings}
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
      nextUp={
        meetings != null && (
          <NextUpHero
            meeting={nextUp}
            now={now}
            alertArmed={activeAlertId != null}
            onSkipAlert={dismissAlert}
          />
        )
      }
      briefing={<BriefingCard />}
      onboardingBanner={<OnboardingBanner />}
      schedule={
        meetings != null && <TodaySchedule events={todaysMeetings} now={now} />
      }
      dueToday={<DueTodayCard now={now} />}
      inboxPreview={<InboxPreviewCard />}
      inProgress={<InProgressCard />}
      weekStats={<PulseCard now={now} />}
    />
  );
}

export function TodayView({
  meetings,
  error,
  alertSignal,
  onDismissAlert,
  greeting,
  summary,
  nextUp,
  briefing,
  dueToday,
  schedule,
  inboxPreview,
  inProgress,
  weekStats,
  onboardingBanner,
}: {
  meetings: StoredSignal[] | null;
  error: string | null;
  alertSignal: StoredSignal | null;
  onDismissAlert: () => void;
  greeting?: string;
  summary?: ReactNode;
  nextUp?: ReactNode;
  briefing?: ReactNode;
  dueToday?: ReactNode;
  schedule?: ReactNode;
  inboxPreview?: ReactNode;
  inProgress?: ReactNode;
  weekStats?: ReactNode;
  onboardingBanner?: ReactNode;
}) {
  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5 px-10 pt-8 pb-16">
      <header>
        <h1 className="font-semibold text-3xl text-foreground leading-[1.2] tracking-[-0.6px]">
          {greeting ?? "Today"}
        </h1>
        {summary && (
          <p className="mt-1 text-muted-foreground text-sm">{summary}</p>
        )}
      </header>

      {onboardingBanner}

      {error && (
        <p className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {error}
        </p>
      )}

      {meetings == null && !error && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {weekStats}

      {nextUp}

      {briefing}

      {dueToday}

      <div className="grid gap-5 md:grid-cols-[1.3fr_1fr]">
        {inboxPreview}
        {inProgress}
      </div>

      {schedule}

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

type OnboardingStatusLoader = () => Promise<OnboardingStatus>;
type OnboardingCompleter = () => Promise<{ ok: true; onboarded_at: string }>;

export function OnboardingBanner({
  loader,
  completer,
}: {
  loader?: OnboardingStatusLoader;
  completer?: OnboardingCompleter;
} = {}) {
  const load = useMemo(
    () =>
      loader ?? (() => apiFetch("/api/onboarding/status") as Promise<OnboardingStatus>),
    [loader],
  );
  const complete = useMemo(
    () =>
      completer ??
      (() =>
        apiFetch("/api/onboarding/complete", { method: "POST" }) as Promise<{
          ok: true;
          onboarded_at: string;
        }>),
    [completer],
  );

  const [verdict, setVerdict] = useState<{ showBanner: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((status) => {
        if (cancelled) return;
        const gate = decideOnboardingGate(status);
        if (gate.autoComplete) {
          complete().catch(() => {
            // Best-effort; the next /today load will re-evaluate from the DB.
          });
          setVerdict({ showBanner: false });
          return;
        }
        setVerdict({ showBanner: gate.showBanner });
      })
      .catch(() => {
        if (cancelled) return;
        setVerdict({ showBanner: false });
      });
    return () => {
      cancelled = true;
    };
  }, [load, complete]);

  if (!verdict?.showBanner) return null;

  return (
    <aside
      aria-label="Finish onboarding"
      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground text-sm">
          Finish setting up Devy
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Connect at least one source — GitHub, Slack, or Google Calendar — to
          activate your daily command center.
        </p>
      </div>
      <Link
        to="/onboarding"
        className="inline-flex shrink-0 items-center rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs hover:opacity-90"
      >
        Continue
      </Link>
    </aside>
  );
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
      className="rounded-lg border border-border bg-card px-[18px] py-4"
    >
      <header className="flex items-center gap-2.5">
        <SourceGlyph source="ai" size={20} />
        <span className="font-semibold text-foreground text-sm leading-[1.3]">
          Morning briefing
        </span>
        {result?.ok && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {result.model}
            {latencyMs != null && ` · ${formatLatency(latencyMs)}`}
            {" · $0.000"}
            {result.cached && " · cached"}
          </span>
        )}
        <span className="flex-1" />
        {result?.ok && result.used_fallback && (
          <span className="inline-flex items-center rounded-sm border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-[11px] text-amber-800">
            Running on fallback model
          </span>
        )}
        {result?.ok && (
          <CossButton
            variant="ghost"
            size="xs"
            onClick={regenerate}
            disabled={busy}
          >
            <RefreshCw aria-hidden="true" />
            Regenerate
          </CossButton>
        )}
      </header>
      <div className="mt-3 text-foreground text-sm leading-relaxed">
        {busy && !result && (
          <p className="text-muted-foreground">Generating your briefing…</p>
        )}
        {result?.ok && (
          <>
            <p className="whitespace-pre-line">{renderBold(result.text)}</p>
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
      <header className="flex items-baseline gap-2">
        <span className="font-semibold text-[15px] text-foreground leading-[1.3]">
          Today
        </span>
        <span className="font-medium text-muted-foreground text-xs">
          {formatHeaderDate(now)}
        </span>
        <span className="flex-1" />
        <span className="font-medium text-muted-foreground text-xs">
          {formatHeaderTime(now)}
        </span>
      </header>
      {events.length === 0 ? (
        <p className="mt-3 text-muted-foreground text-sm">No meetings today.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {events.map((e) => {
            const isNow = isCurrentBlock(e, now);
            const focus = e.isFocus;
            const barColor = focus
              ? "var(--ink, var(--foreground))"
              : "var(--primary)";
            return (
              <li
                key={e.signal.id}
                aria-current={isNow ? "true" : undefined}
                className={
                  focus
                    ? "grid items-center gap-3.5 bg-foreground px-2 py-2 text-background first:rounded-t-md last:rounded-b-md"
                    : "grid items-center gap-3.5 py-2"
                }
                style={{ gridTemplateColumns: "60px 6px 1fr auto" }}
              >
                <time
                  dateTime={e.startsAt.toISOString()}
                  className={
                    focus
                      ? "text-right font-mono text-[11px] text-background/80 tabular-nums"
                      : "text-right font-mono text-[11px] text-muted-foreground tabular-nums"
                  }
                >
                  {(() => {
                    const { start, end } = formatRangeShort(
                      e.startsAt,
                      e.endsAt,
                    );
                    return (
                      <>
                        {start}
                        {end && (
                          <span
                            style={
                              focus
                                ? undefined
                                : { color: "var(--muted-soft)" }
                            }
                          >
                            {" – "}
                            {end}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </time>
                <span
                  aria-hidden="true"
                  className="block h-full min-h-[28px] w-1.5 rounded-full"
                  style={{ background: barColor }}
                />
                <div className="min-w-0">
                  <p
                    className={
                      focus
                        ? "flex items-center gap-2 truncate font-semibold text-background text-sm"
                        : isNow
                          ? "flex items-center gap-2 truncate font-semibold text-foreground text-sm"
                          : "flex items-center gap-2 truncate font-medium text-foreground text-sm"
                    }
                  >
                    <span className="truncate">{e.signal.title}</span>
                    {isNow && (
                      <span
                        className="inline-flex shrink-0 items-center rounded-full px-2 py-px font-semibold text-[10px] uppercase tracking-wider"
                        style={{
                          background: "var(--accent-tint, var(--secondary))",
                          color: "var(--primary-active, var(--primary))",
                        }}
                      >
                        NOW
                      </span>
                    )}
                  </p>
                  <p
                    className={
                      focus
                        ? "truncate font-mono text-[11px] text-background/70"
                        : "truncate font-mono text-[11px] text-muted-foreground"
                    }
                  >
                    {focus ? "deep work · DND" : "google meet"}
                  </p>
                </div>
                {!isNow && e.videoLink && (
                  <a
                    href={e.videoLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
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

function formatHeaderDate(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatHeaderTime(d: Date): string {
  return d.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRangeShort(
  start: Date,
  end: Date | null,
): { start: string; end: string | null } {
  const s = start.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return { start: s, end: null };
  const e = end.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return { start: s, end: e };
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

  const nowIso = new Date().toISOString();
  const unreadCount = preview.length;
  return (
    <article
      aria-label="Inbox preview"
      className="rounded-lg border border-border bg-card px-4 pt-5 pb-3"
    >
      <header className="flex items-baseline gap-2 px-1.5">
        <span className="font-semibold text-[15px] text-foreground leading-[1.3]">
          Needs you
        </span>
        {unreadCount > 0 && (
          <span className="font-medium text-muted-foreground text-xs">
            {unreadCount} unread
          </span>
        )}
        <span className="flex-1" />
        <a
          href="/inbox"
          aria-label="Open all"
          className="rounded-sm px-2.5 py-1 font-medium text-foreground text-xs hover:bg-accent"
        >
          Open all →
        </a>
      </header>
      {error && <p className="mt-3 px-1.5 text-destructive text-sm">{error}</p>}
      {!error && signals == null && (
        <p className="mt-3 px-1.5 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && signals != null && preview.length === 0 && (
        <p className="mt-3 px-1.5 text-muted-foreground text-sm">
          Nothing actionable. Inbox zero.
        </p>
      )}
      {!error && preview.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {preview.map((s) => (
            <li key={s.id}>
              <Link
                to="/inbox"
                search={{ signal: s.id }}
                className="block rounded-md hover:bg-accent"
              >
                <InboxPreviewRow signal={s} nowIso={nowIso} />
              </Link>
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

function ticketStatusDotTone(kind: string): "good" | "warn" {
  return kind === "ticket_blocked" ? "warn" : "good";
}

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

type DueTodayLoader = (date: Date) => Promise<DueCard[]>;

const defaultDueTodayLoader: DueTodayLoader = (date: Date) => {
  const client = supabase as unknown as SupabaseLike;
  return listCardsDueOn(client, date);
};

const PRIORITY_LABEL: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export function DueTodayCard({
  now,
  loader = defaultDueTodayLoader,
}: {
  now: Date;
  loader?: DueTodayLoader;
}) {
  const [cards, setCards] = useState<DueCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loader(now)
      .then((list) => {
        if (cancelled) return;
        setCards(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, now]);

  if (!error && cards != null && cards.length === 0) return null;

  return (
    <article
      aria-label="Due today"
      className="rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-baseline gap-2">
        <span className="font-semibold text-base text-foreground">
          Due today
        </span>
        {cards != null && cards.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {cards.length} {plural(cards.length, "card")}
          </span>
        )}
      </header>
      {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
      {!error && cards == null && (
        <p className="mt-3 text-muted-foreground text-sm">Loading…</p>
      )}
      {!error && cards != null && cards.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {cards.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 border-[var(--hairline-soft)] border-b py-3 last:border-0"
            >
              {c.priority && (
                <span className="rounded-md bg-secondary px-2 py-0.5 font-mono font-semibold text-[11px] text-foreground">
                  {PRIORITY_LABEL[c.priority] ?? c.priority}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground text-sm">
                  {c.title}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {c.project_name}
                </span>
              </span>
              <Link
                to="/projects/$projectId"
                params={{ projectId: c.project_id }}
                search={{ card: c.id }}
                aria-label={`Open card ${c.title}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
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
      <header className="flex items-baseline gap-2">
        <span className="font-semibold text-[15px] text-foreground leading-[1.3]">
          In progress
        </span>
        {tickets != null && top.length > 0 && (
          <span className="font-medium text-muted-foreground text-xs">
            {top.length} {plural(top.length, "ticket")}
          </span>
        )}
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
        <ul className="mt-2 flex flex-col">
          {top.map((s) => {
            const days = daysInProgress(s);
            const prRef = prRefOf(s);
            const priority = s.payload?.priority_label as string | undefined;
            const ticketId =
              (s.payload?.identifier as string | undefined) || s.source_id;
            const statusLabel = TICKET_STATUS_LABEL[s.kind] ?? s.kind;
            const statusTone = ticketStatusDotTone(s.kind);
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 border-[var(--hairline-soft)] border-b py-3 last:border-0"
              >
                <span className="rounded-md bg-secondary px-2 py-0.5 font-mono font-semibold text-[11px] text-foreground">
                  {ticketId}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground text-sm">
                    {s.title}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {[
                      priority,
                      days != null && `${days}d in progress`,
                      prRef && `PR ${prRef}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  aria-label={statusLabel}
                  data-status-tone={statusTone}
                  role="img"
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background:
                      statusTone === "warn"
                        ? "var(--warn, #c2740c)"
                        : "var(--good, #0a8754)",
                  }}
                />
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-foreground text-xs hover:bg-accent"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
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
