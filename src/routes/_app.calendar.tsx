import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { type ConflictPair, detectConflicts } from "#/lib/calendar-conflicts";
import {
  eventsByMonthGrid,
  type MeetingEvent,
  type MonthCell,
  toMeetingEvents,
} from "#/lib/calendar-view";
import { cn } from "#/lib/cn";
import type { StoredSignal } from "#/lib/next-up";

export type CalendarViewMode = "day" | "week" | "month";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const HOUR_START = 8;
const HOUR_END = 18;
const HOURS = HOUR_END - HOUR_START;
const DAY_START_MIN = HOUR_START * 60;
const DAY_END_MIN = HOUR_END * 60;
const SLOT_PX = 48;
const GRID_PX = HOURS * SLOT_PX;

type EventKind = "focus" | "meeting" | "break";

export type WeekEvent = {
  id: string;
  day: number;
  start: number;
  end: number;
  kind: EventKind;
  title: string;
};

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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const meetings = useMemo(
    () => (signals ? toMeetingEvents(signals) : []),
    [signals],
  );

  return (
    <CalendarView
      meetings={meetings}
      now={now}
      loading={signals == null}
      error={error}
    />
  );
}

export function CalendarView({
  events,
  meetings,
  now,
  loading = false,
  error = null,
  defaultMode = "week",
}: {
  events?: WeekEvent[];
  meetings?: MeetingEvent[];
  now: Date;
  loading?: boolean;
  error?: string | null;
  defaultMode?: CalendarViewMode;
}) {
  const [mode, setMode] = useState<CalendarViewMode>(defaultMode);

  const weekStart = useMemo(() => mondayOf(now), [now]);
  const weekEvents = useMemo<WeekEvent[]>(() => {
    if (events) return events;
    if (meetings) return toWeekEvents(meetings, weekStart);
    return [];
  }, [events, meetings, weekStart]);
  const conflicts = useMemo(() => detectConflicts(weekEvents), [weekEvents]);
  const todayCol = mondayCol(now);

  const subtitle =
    mode === "week"
      ? `${weekRangeLabel(now)} · Mon–Fri, 8:00–18:00`
      : mode === "day"
        ? `${dayLongLabel(now)} · 8:00–18:00`
        : monthLabel(now);

  return (
    <section className="p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ModeSwitch mode={mode} onChange={setMode} />
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      )}

      {mode === "week" && (
        <>
          <WeekGrid
            events={weekEvents}
            conflicts={conflicts}
            todayCol={todayCol}
            now={now}
          />
          {conflicts.length > 0 && (
            <ConflictBanner pairs={conflicts} now={now} />
          )}
        </>
      )}

      {mode === "day" && (
        <DayGrid events={weekEvents} todayCol={todayCol} now={now} />
      )}

      {mode === "month" && (
        <MonthGrid cells={eventsByMonthGrid(meetings ?? [], now)} now={now} />
      )}
    </section>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: CalendarViewMode;
  onChange: (m: CalendarViewMode) => void;
}) {
  const modes: CalendarViewMode[] = ["day", "week", "month"];
  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
    >
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          data-state={mode === m ? "active" : "inactive"}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-xs px-3 py-1 text-xs font-medium capitalize transition-colors",
            mode === m
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function WeekGrid({
  events,
  conflicts,
  todayCol,
  now,
}: {
  events: WeekEvent[];
  conflicts: ConflictPair<WeekEvent>[];
  todayCol: number | null;
  now: Date;
}) {
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of conflicts) {
      ids.add(p.a.id);
      ids.add(p.b.id);
    }
    return ids;
  }, [conflicts]);

  const hours = Array.from({ length: HOURS + 1 }, (_, i) => HOUR_START + i);

  return (
    <section
      aria-label="Week grid"
      className="mt-6 overflow-hidden rounded-md border border-border bg-card"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: "64px repeat(5, 1fr)" }}
      >
        <div className="border-b border-border" />
        {WEEKDAYS.map((label, i) => (
          <div
            key={label}
            data-day-col={i}
            data-today={todayCol === i || undefined}
            className={cn(
              "border-b border-l border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground",
              todayCol === i && "text-foreground",
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: "64px repeat(5, 1fr)",
          height: `${GRID_PX}px`,
        }}
      >
        <div className="relative">
          {hours.map((h) => (
            <div
              key={`hour-${h}`}
              className="absolute left-0 right-0 border-t border-hairline-soft px-2 text-[10px] text-muted-foreground"
              style={{ top: `${(h - HOUR_START) * SLOT_PX}px` }}
            >
              {h}:00
            </div>
          ))}
        </div>
        {WEEKDAYS.map((label, dayIdx) => (
          <DayColumn
            key={label}
            dayIdx={dayIdx}
            events={events.filter((e) => e.day === dayIdx)}
            conflictIds={conflictIds}
            isToday={todayCol === dayIdx}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}

function DayColumn({
  dayIdx,
  events,
  conflictIds,
  isToday,
  now,
}: {
  dayIdx: number;
  events: WeekEvent[];
  conflictIds: Set<string>;
  isToday: boolean;
  now: Date;
}) {
  const lanes = layoutLanes(events);
  const slots = Array.from({ length: HOURS }, (_, i) => HOUR_START + i);
  return (
    <div
      data-day-col={dayIdx}
      data-today={isToday || undefined}
      className="relative border-l border-border"
    >
      {slots.map((h) => (
        <div
          key={`slot-${h}`}
          className="absolute left-0 right-0 border-t border-hairline-soft"
          style={{
            top: `${(h - HOUR_START) * SLOT_PX}px`,
            height: `${SLOT_PX}px`,
          }}
        />
      ))}
      {events.map((e) => {
        const lane = lanes.get(e.id) ?? { col: 0, of: 1 };
        const isConflict = conflictIds.has(e.id);
        return (
          <EventBlock
            key={e.id}
            event={e}
            lane={lane}
            isConflict={isConflict}
          />
        );
      })}
      {isToday && <NowLine now={now} />}
    </div>
  );
}

function EventBlock({
  event,
  lane,
  isConflict,
}: {
  event: WeekEvent;
  lane: { col: number; of: number };
  isConflict: boolean;
}) {
  const top = ((event.start - DAY_START_MIN) / 60) * SLOT_PX;
  const height = Math.max(
    16,
    ((Math.min(event.end, DAY_END_MIN) - event.start) / 60) * SLOT_PX,
  );
  const widthPct = 100 / lane.of;
  const leftPct = lane.col * widthPct;
  const tone = kindClass(event.kind);
  const hatched = isConflict
    ? {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(193,53,21,0.18) 0 6px, transparent 6px 12px)",
      }
    : undefined;
  return (
    <article
      aria-label={event.title}
      data-event-id={event.id}
      data-kind={event.kind}
      data-conflict={isConflict || undefined}
      className={cn(
        "absolute mx-0.5 overflow-hidden rounded-xs px-2 py-1 text-[11px] leading-tight shadow-sm",
        tone,
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        ...(hatched ?? {}),
      }}
    >
      <span className="block truncate font-medium">{event.title}</span>
      <span className="block text-[10px] opacity-80">
        {fmtMinutes(event.start)}–{fmtMinutes(event.end)}
      </span>
    </article>
  );
}

function DayGrid({
  events,
  todayCol,
  now,
}: {
  events: WeekEvent[];
  todayCol: number | null;
  now: Date;
}) {
  const dayCol = todayCol ?? 0;
  const dayEvents = events.filter((e) => e.day === dayCol);
  const conflicts = useMemo(() => detectConflicts(dayEvents), [dayEvents]);
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of conflicts) {
      ids.add(p.a.id);
      ids.add(p.b.id);
    }
    return ids;
  }, [conflicts]);
  const lanes = layoutLanes(dayEvents);
  const slots = Array.from({ length: HOURS }, (_, i) => HOUR_START + i);
  const hours = Array.from({ length: HOURS + 1 }, (_, i) => HOUR_START + i);

  return (
    <section
      aria-label="Day grid"
      className="mt-6 overflow-hidden rounded-md border border-border bg-card"
    >
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: "64px 1fr",
          height: `${GRID_PX}px`,
        }}
      >
        <div className="relative">
          {hours.map((h) => (
            <div
              key={`hour-${h}`}
              className="absolute right-0 left-0 border-hairline-soft border-t px-2 text-[10px] text-muted-foreground"
              style={{ top: `${(h - HOUR_START) * SLOT_PX}px` }}
            >
              {h}:00
            </div>
          ))}
        </div>
        <div
          data-day-col={dayCol}
          data-today={todayCol === dayCol || undefined}
          className="relative border-border border-l"
        >
          {slots.map((h) => (
            <div
              key={`slot-${h}`}
              className="absolute right-0 left-0 border-hairline-soft border-t"
              style={{
                top: `${(h - HOUR_START) * SLOT_PX}px`,
                height: `${SLOT_PX}px`,
              }}
            />
          ))}
          {dayEvents.map((e) => {
            const lane = lanes.get(e.id) ?? { col: 0, of: 1 };
            return (
              <EventBlock
                key={e.id}
                event={e}
                lane={lane}
                isConflict={conflictIds.has(e.id)}
              />
            );
          })}
          {todayCol === dayCol && <NowLine now={now} />}
        </div>
      </div>
    </section>
  );
}

function MonthGrid({ cells, now }: { cells: MonthCell[]; now: Date }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const headerDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section
      aria-label="Month grid"
      className="mt-6 overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="grid grid-cols-7">
        {headerDays.map((label) => (
          <div
            key={label}
            className="border-border border-b px-2 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const isToday = cell.day.getTime() === today.getTime();
          const dayNum = cell.day.getDate();
          const count = cell.events.length;
          return (
            <div
              key={cell.day.toISOString()}
              data-in-month={cell.inMonth || undefined}
              data-today={isToday || undefined}
              className={cn(
                "min-h-20 border-border border-b border-l p-2 first:border-l-0 [&:nth-child(7n+1)]:border-l-0",
                !cell.inMonth && "bg-muted/40",
              )}
            >
              <div
                className={cn(
                  "font-medium text-xs",
                  cell.inMonth ? "text-foreground" : "text-muted-foreground",
                  isToday && "text-primary",
                )}
              >
                {dayNum}
              </div>
              {count > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {cell.events.slice(0, 3).map((ev) => (
                    <li
                      key={ev.signal.id}
                      className="truncate rounded-xs bg-primary/10 px-1 text-[10px] text-foreground"
                    >
                      {ev.signal.title}
                    </li>
                  ))}
                  {count > 3 && (
                    <li className="text-[10px] text-muted-foreground">
                      +{count - 3} more
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NowLine({ now }: { now: Date }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < DAY_START_MIN || minutes > DAY_END_MIN) return null;
  const top = ((minutes - DAY_START_MIN) / 60) * SLOT_PX;
  return (
    <>
      <hr
        data-testid="now-line"
        aria-label="Now"
        className="pointer-events-none absolute left-0 right-0 z-10 m-0 h-px border-0 bg-primary"
        style={{ top: `${top}px` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1 -translate-y-1 rounded-full bg-primary"
        style={{ top: `${top}px`, left: 0 }}
      />
    </>
  );
}

function ConflictBanner({
  pairs,
  now,
}: {
  pairs: ConflictPair<WeekEvent>[];
  now: Date;
}) {
  const weekStart = mondayOf(now);
  return (
    <article
      aria-label="Conflict"
      className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        Conflict
      </div>
      <ul className="mt-2 space-y-2">
        {pairs.map((p) => (
          <li
            key={`${p.a.id}-${p.b.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground"
          >
            <span className="text-destructive">
              {dayLabel(weekStart, p.a.day)} · {fmtMinutes(p.a.start)} ·{" "}
              <span className="font-medium">{p.a.title}</span> overlaps{" "}
              <span className="font-medium">{p.b.title}</span>
            </span>
            <button
              type="button"
              className="ml-auto rounded-xs border border-destructive/30 bg-card px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
            >
              Decline
            </button>
            <button
              type="button"
              className="rounded-xs border border-destructive/30 bg-card px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
            >
              Reschedule
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

function kindClass(kind: EventKind): string {
  if (kind === "focus") return "bg-foreground text-background";
  if (kind === "break") return "bg-secondary text-foreground";
  return "bg-primary text-primary-foreground";
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Monday 00:00 local for the week containing `d`. */
function mondayOf(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

/** 0..4 if `d` falls Mon–Fri, else null (weekend). */
function mondayCol(d: Date): number | null {
  const offset = (d.getDay() + 6) % 7;
  if (offset > 4) return null;
  return offset;
}

function dayLabel(weekStart: Date, dayIdx: number): string {
  const day = new Date(weekStart);
  day.setDate(weekStart.getDate() + dayIdx);
  return day.toLocaleDateString(undefined, { weekday: "short" });
}

function dayLongLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function weekRangeLabel(now: Date): string {
  const start = mondayOf(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function detectKind(e: MeetingEvent): EventKind {
  if (e.isFocus) return "focus";
  const t = e.signal.title?.toLowerCase() ?? "";
  if (/\bbreak\b|\blunch\b/.test(t)) return "break";
  return "meeting";
}

export function toWeekEvents(
  events: MeetingEvent[],
  weekStart: Date,
): WeekEvent[] {
  const start = weekStart.getTime();
  const end = start + 5 * 24 * 60 * 60 * 1000;
  const out: WeekEvent[] = [];
  for (const e of events) {
    const t = e.startsAt.getTime();
    if (t < start || t >= end) continue;
    const day = Math.floor((t - start) / (24 * 60 * 60 * 1000));
    if (day < 0 || day > 4) continue;
    const startMin = e.startsAt.getHours() * 60 + e.startsAt.getMinutes();
    const endMin = e.endsAt.getHours() * 60 + e.endsAt.getMinutes();
    if (endMin <= DAY_START_MIN || startMin >= DAY_END_MIN) continue;
    out.push({
      id: e.signal.id,
      day,
      start: Math.max(startMin, DAY_START_MIN),
      end: Math.min(endMin, DAY_END_MIN),
      kind: detectKind(e),
      title: e.signal.title,
    });
  }
  return out;
}

/**
 * Pack same-day overlapping events into side-by-side lanes. Greedy: events
 * sorted by start, each placed in the leftmost lane whose previous event
 * has already ended.
 */
function layoutLanes(
  events: WeekEvent[],
): Map<string, { col: number; of: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const out = new Map<string, { col: number; of: number }>();
  type Cluster = { items: WeekEvent[]; end: number };
  const clusters: Cluster[] = [];
  for (const e of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && e.start < last.end) {
      last.items.push(e);
      last.end = Math.max(last.end, e.end);
    } else {
      clusters.push({ items: [e], end: e.end });
    }
  }
  for (const cluster of clusters) {
    const lanes: number[] = [];
    const assigned = new Map<string, number>();
    for (const e of cluster.items) {
      let col = lanes.findIndex((endMin) => endMin <= e.start);
      if (col === -1) {
        col = lanes.length;
        lanes.push(e.end);
      } else {
        lanes[col] = e.end;
      }
      assigned.set(e.id, col);
    }
    const of = lanes.length;
    for (const e of cluster.items) {
      const col = assigned.get(e.id) ?? 0;
      out.set(e.id, { col, of });
    }
  }
  return out;
}
