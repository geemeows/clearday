import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Focus,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import {
  type Conflict,
  type DayBucket,
  eventsByMonthGrid,
  eventsByWeekDay,
  eventsForDay,
  localDayStart,
  type MeetingEvent,
  type MonthCell,
  pickFocusBlocks,
  pickNextConflict,
  toMeetingEvents,
  weekStartFor,
} from "#/lib/calendar-view";
import { cn } from "#/lib/cn";
import { formatCountdown, type StoredSignal } from "#/lib/next-up";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

type ViewMode = "day" | "week" | "month";

function CalendarPage() {
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/signals?filter=meetings")
      .then((body) => {
        if (cancelled) return;
        setSignals((body as { signals: StoredSignal[] }).signals);
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

  // Tick once a minute so the live-event ring, "Next: …" countdown, and
  // FocusBlocks "upcoming" filter stay fresh without a page reload.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const events = useMemo(
    () => (signals ? toMeetingEvents(signals) : []),
    [signals],
  );
  return (
    <CalendarView
      events={events}
      now={now}
      loading={signals == null}
      error={error}
      onDeclined={(id) =>
        setSignals((cur) => (cur ? cur.filter((s) => s.id !== id) : cur))
      }
    />
  );
}

export type DeclineRequest = {
  event_id: string;
  signal_id: string;
};

export type DeclineResult = { ok: true } | { ok: false; error: string };

const defaultDecliner: (req: DeclineRequest) => Promise<DeclineResult> = async (
  req,
) => {
  try {
    const out = (await apiFetch("/api/calendar/decline", {
      method: "POST",
      body: JSON.stringify(req),
    })) as DeclineResult;
    return out;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "request failed",
    };
  }
};

export function CalendarView({
  events,
  now: nowProp,
  loading = false,
  error = null,
  onDeclined,
  decliner = defaultDecliner,
}: {
  events: MeetingEvent[];
  now?: Date;
  loading?: boolean;
  error?: string | null;
  onDeclined?: (signalId: string) => void;
  decliner?: (req: DeclineRequest) => Promise<DeclineResult>;
}) {
  const [mode, setMode] = useState<ViewMode>("day");
  const [anchor, setAnchor] = useState<Date>(() =>
    nowProp ? localDayStart(nowProp) : localDayStart(new Date()),
  );
  const now = nowProp ?? new Date();

  const todayBucket = useMemo<DayBucket>(
    () => ({ day: anchor, events: eventsForDay(events, anchor) }),
    [events, anchor],
  );
  const weekBuckets = useMemo<DayBucket[]>(
    () => eventsByWeekDay(events, weekStartFor(anchor)),
    [events, anchor],
  );
  const monthCells = useMemo<MonthCell[]>(
    () => eventsByMonthGrid(events, anchor),
    [events, anchor],
  );
  const allWeekEvents = useMemo(
    () => weekBuckets.flatMap((b) => b.events),
    [weekBuckets],
  );
  const conflict = useMemo(
    () => pickNextConflict(allWeekEvents, now),
    [allWeekEvents, now],
  );
  const focusBlocks = useMemo(
    () => pickFocusBlocks(allWeekEvents),
    [allWeekEvents],
  );
  const todayEvents = useMemo(() => eventsForDay(events, now), [events, now]);
  const nextEvent = useMemo(
    () => todayEvents.find((e) => e.startsAt.getTime() > now.getTime()) ?? null,
    [todayEvents, now],
  );

  const goPrev = () => {
    const d = new Date(anchor);
    if (mode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - (mode === "day" ? 1 : 7));
    setAnchor(d);
  };
  const goNext = () => {
    const d = new Date(anchor);
    if (mode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + (mode === "day" ? 1 : 7));
    setAnchor(d);
  };
  const goToday = () => setAnchor(localDayStart(now));

  return (
    <section className="p-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div role="tablist" aria-label="View mode" className="ml-2 flex gap-1">
          <ViewTab active={mode === "day"} onClick={() => setMode("day")}>
            Day
          </ViewTab>
          <ViewTab active={mode === "week"} onClick={() => setMode("week")}>
            Week
          </ViewTab>
          <ViewTab active={mode === "month"} onClick={() => setMode("month")}>
            Month
          </ViewTab>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous"
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded border border-zinc-200 px-2.5 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next"
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>
      <p className="mt-1 text-sm text-zinc-500">{anchorLabel(anchor, mode)}</p>

      {error && (
        <p className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-6 text-sm text-zinc-500">Loading…</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {mode === "day" && <DayGrid bucket={todayBucket} now={now} />}
          {mode === "week" && <WeekGrid buckets={weekBuckets} now={now} />}
          {mode === "month" && (
            <MonthGrid cells={monthCells} anchor={anchor} now={now} />
          )}
        </div>
        <aside className="space-y-4">
          <TodayPanel events={todayEvents} nextEvent={nextEvent} now={now} />
          <ConflictCard
            conflict={conflict}
            now={now}
            onDeclined={onDeclined}
            decliner={decliner}
          />
          <FocusBlocksCard blocks={focusBlocks} now={now} />
        </aside>
      </div>
    </section>
  );
}

function ViewTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded border px-2.5 py-1 text-sm",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function DayGrid({ bucket, now }: { bucket: DayBucket; now: Date }) {
  if (bucket.events.length === 0) {
    return (
      <div className="rounded border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
        No meetings on this day.
      </div>
    );
  }
  return (
    <ul aria-label="Day events" className="space-y-2">
      {bucket.events.map((e) => (
        <li key={e.signal.id}>
          <EventBlock event={e} now={now} />
        </li>
      ))}
    </ul>
  );
}

function WeekGrid({ buckets, now }: { buckets: DayBucket[]; now: Date }) {
  return (
    <ul
      aria-label="Week grid"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7"
    >
      {buckets.map((b) => (
        <li
          key={b.day.toISOString()}
          className="min-h-[120px] rounded border border-zinc-200 bg-white p-3"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {b.day.toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            })}
          </div>
          {b.events.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-400">—</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {b.events.map((e) => (
                <li key={e.signal.id}>
                  <EventBlock event={e} now={now} compact />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function MonthGrid({
  cells,
  anchor,
  now,
}: {
  cells: MonthCell[];
  anchor: Date;
  now: Date;
}) {
  const todayKey = localDayStart(now).toDateString();
  const weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section aria-label="Month grid">
      <ul className="grid grid-cols-7 gap-px text-xs font-medium uppercase tracking-wider text-zinc-500">
        {weekdayHeaders.map((w) => (
          <li key={w} className="px-2 py-1">
            {w}
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-7 gap-px overflow-hidden rounded border border-zinc-200 bg-zinc-200">
        {cells.map((c) => {
          const isToday = c.day.toDateString() === todayKey;
          const focusCount = c.events.filter((e) => e.isFocus).length;
          return (
            <li
              key={c.day.toISOString()}
              aria-label={`${c.day.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}${c.events.length > 0 ? ` — ${c.events.length} events` : ""}`}
              className={cn(
                "min-h-[80px] bg-white p-1.5",
                !c.inMonth && "bg-zinc-50 text-zinc-400",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs",
                    isToday &&
                      "inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white",
                  )}
                >
                  {c.day.getDate()}
                </span>
                {c.events.length > 0 && (
                  <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-700">
                    {c.events.length}
                  </span>
                )}
              </div>
              {focusCount > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">
                  <Focus className="h-2.5 w-2.5" />
                  {focusCount}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="sr-only">
        {anchor.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}
      </p>
    </section>
  );
}

function EventBlock({
  event,
  now,
  compact = false,
}: {
  event: MeetingEvent;
  now: Date;
  compact?: boolean;
}) {
  const live =
    event.startsAt.getTime() <= now.getTime() &&
    event.endsAt.getTime() > now.getTime();
  return (
    <article
      aria-label={event.signal.title}
      className={cn(
        "rounded border bg-white p-3",
        event.isFocus ? "border-violet-300 bg-violet-50" : "border-zinc-200",
        live && "ring-2 ring-zinc-900",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {event.isFocus && (
          <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
            <Focus className="h-3 w-3" />
            DND auto-on
          </span>
        )}
        <span>
          {formatLocalTime(event.startsAt)}–{formatLocalTime(event.endsAt)}
        </span>
      </div>
      <p
        className={cn(
          "mt-1 font-medium text-zinc-900",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {event.signal.title}
      </p>
      {!compact && event.videoLink && (
        <a
          href={event.videoLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 text-xs text-white hover:bg-zinc-800"
        >
          <Video className="h-3 w-3" />
          Join
        </a>
      )}
    </article>
  );
}

function TodayPanel({
  events,
  nextEvent,
  now,
}: {
  events: MeetingEvent[];
  nextEvent: MeetingEvent | null;
  now: Date;
}) {
  return (
    <article
      aria-label="Today"
      className="rounded border border-zinc-200 bg-white p-4"
    >
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Today
      </h2>
      {nextEvent && (
        <p className="mt-2 text-sm text-zinc-700">
          Next: <span className="font-medium">{nextEvent.signal.title}</span>{" "}
          {formatCountdown(nextEvent.startsAt, now)}
        </p>
      )}
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">Nothing scheduled today.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.map((e) => (
            <li key={e.signal.id} className="flex items-center gap-2">
              <span className="w-12 text-xs text-zinc-500">
                {formatLocalTime(e.startsAt)}
              </span>
              <span className="flex-1 truncate text-sm text-zinc-900">
                {e.signal.title}
              </span>
              {e.videoLink && (
                <a
                  href={e.videoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label={`Join ${e.signal.title}`}
                >
                  <Video className="h-3.5 w-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ConflictCard({
  conflict,
  now,
  onDeclined,
  decliner,
}: {
  conflict: Conflict | null;
  now: Date;
  onDeclined?: (signalId: string) => void;
  decliner: (req: DeclineRequest) => Promise<DeclineResult>;
}) {
  const [pending, setPending] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  if (!conflict) return null;
  const laterSignal = conflict.b.signal;
  const sourceId = laterSignal.source_id;
  const handleDecline = async () => {
    if (!sourceId || pending) return;
    setPending(true);
    setDeclineError(null);
    const out = await decliner({
      event_id: sourceId,
      signal_id: laterSignal.id,
    });
    setPending(false);
    if (out.ok) {
      onDeclined?.(laterSignal.id);
    } else {
      setDeclineError(out.error);
    }
  };
  return (
    <article
      aria-label="Conflict"
      className="rounded border border-amber-300 bg-amber-50 p-4"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        Conflict
      </div>
      <p className="mt-2 text-sm text-amber-900">
        Two events overlap {formatCountdown(conflict.b.startsAt, now)}.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-amber-900">
        <li className="truncate">
          <span className="text-xs text-amber-800">
            {formatLocalTime(conflict.a.startsAt)}–
            {formatLocalTime(conflict.a.endsAt)}
          </span>{" "}
          {conflict.a.signal.title}
        </li>
        <li className="truncate">
          <span className="text-xs text-amber-800">
            {formatLocalTime(conflict.b.startsAt)}–
            {formatLocalTime(conflict.b.endsAt)}
          </span>{" "}
          {conflict.b.signal.title}
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {sourceId && (
          <button
            type="button"
            onClick={handleDecline}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Declining…" : "Decline"}
          </button>
        )}
        {laterSignal.url && (
          <a
            href={laterSignal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Calendar
          </a>
        )}
      </div>
      {declineError && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {declineError}
        </p>
      )}
    </article>
  );
}

function FocusBlocksCard({
  blocks,
  now,
}: {
  blocks: MeetingEvent[];
  now: Date;
}) {
  const upcoming = blocks.filter((b) => b.endsAt.getTime() > now.getTime());
  return (
    <article
      aria-label="Focus blocks"
      className="rounded border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <Focus className="h-3.5 w-3.5" />
        Focus blocks
      </div>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No focus blocks scheduled this week.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {upcoming.map((b) => (
            <li key={b.signal.id} className="text-sm text-zinc-700">
              <span className="text-xs text-zinc-500">
                {b.startsAt.toLocaleDateString(undefined, {
                  weekday: "short",
                })}{" "}
                {formatLocalTime(b.startsAt)}–{formatLocalTime(b.endsAt)}
              </span>{" "}
              {b.signal.title}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function anchorLabel(anchor: Date, mode: ViewMode): string {
  if (mode === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (mode === "month") {
    return anchor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }
  const start = weekStartFor(anchor);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
