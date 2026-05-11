import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  eventsByMonthGrid,
  type MeetingEvent,
  type MonthCell,
  toMeetingEvents,
} from "#/features/calendar/events";
import {
  type ConflictPair,
  dayLabel,
  dayLongLabel,
  detectConflicts,
  fmtHour,
  fmtMinutes,
  layoutLanes,
  mondayCol,
  mondayOf,
  monthLabel,
  toWeekEvents,
  weekRangeLabel,
} from "#/features/calendar/layout";
import type { EventKind, WeekEvent } from "#/features/calendar/types";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { StoredSignal } from "#/shared/signal";

export type CalendarViewMode = "day" | "week" | "month";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const HOUR_START = 0;
const HOUR_END = 24;
const HOURS = HOUR_END - HOUR_START;
const DAY_START_MIN = HOUR_START * 60;
const DAY_END_MIN = HOUR_END * 60;
const SLOT_PX = 44;
const GRID_PX = HOURS * SLOT_PX;
const GRID_MAX_HEIGHT = "min(70vh, 720px)";

export type { WeekEvent };

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

  const focusHours = useMemo(() => {
    let mins = 0;
    for (const e of weekEvents) {
      if (e.kind === "focus") mins += e.end - e.start;
    }
    return Math.round((mins / 60) * 10) / 10;
  }, [weekEvents]);

  const summary =
    mode === "week"
      ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} · ${focusHours}h focus scheduled`
      : mode === "day"
        ? "00:00–23:00"
        : "Mon–Sun";
  const rangeLabel =
    mode === "week"
      ? weekRangeLabel(now)
      : mode === "day"
        ? dayLongLabel(now)
        : monthLabel(now);

  return (
    <section className="mx-auto max-w-[1400px] space-y-4 px-9 pt-7 pb-12">
      <header className="flex items-center gap-3">
        <h1
          className="font-semibold text-3xl text-foreground"
          style={{ letterSpacing: "-0.6px" }}
        >
          Calendar
        </h1>
        <span className="flex-1" />
        <ModeSwitch mode={mode} onChange={setMode} />
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="font-semibold text-2xl text-foreground"
          style={{ letterSpacing: "-0.4px" }}
        >
          {rangeLabel}
        </span>
        <span className="font-mono text-muted-foreground text-xs">
          {summary}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className="rounded-md px-2.5 py-1 font-medium text-xs text-foreground transition-colors hover:bg-secondary"
          style={{
            background: "var(--canvas, var(--background))",
            border: "1px solid var(--hairline-soft, var(--border))",
          }}
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Previous"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          style={{
            border: "1px solid var(--hairline-soft, var(--border))",
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          style={{
            border: "1px solid var(--hairline-soft, var(--border))",
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <Legend />

      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      {loading && !error && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {mode === "week" && (
        <WeekGrid
          events={weekEvents}
          conflicts={conflicts}
          todayCol={todayCol}
          now={now}
        />
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

function Legend() {
  const items: { label: string; swatch: string; bordered?: boolean }[] = [
    { label: "Focus", swatch: "var(--ink, var(--foreground))" },
    { label: "Meeting", swatch: "var(--primary)" },
    {
      label: "Break",
      swatch: "var(--surface-strong, var(--secondary))",
      bordered: true,
    },
    {
      label: "Conflict",
      swatch:
        "repeating-linear-gradient(45deg, rgba(193,53,21,0.18) 0 4px, transparent 4px 8px)",
      bordered: true,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 rounded-xs"
            style={{
              background: it.swatch,
              border: it.bordered
                ? "1px solid var(--hairline-soft, var(--border))"
                : undefined,
            }}
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {it.label}
          </span>
        </div>
      ))}
    </div>
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
      className="inline-flex items-center gap-1 rounded-full p-0.5"
      style={{ background: "var(--surface-strong, var(--secondary))" }}
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
            "rounded-full px-3.5 py-1 font-medium text-xs capitalize transition-colors",
            mode === m
              ? "text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          style={
            mode === m
              ? { background: "var(--canvas, var(--background))" }
              : undefined
          }
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

  const hours = Array.from({ length: HOURS }, (_, i) => HOUR_START + i);
  const weekStart = mondayOf(now);

  return (
    <section
      aria-label="Week grid"
      className="overflow-hidden rounded-lg bg-card"
      style={{ border: "1px solid var(--hairline-soft, var(--border))" }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: "64px repeat(5, 1fr)",
          borderBottom: "1px solid var(--hairline-soft, var(--border))",
        }}
      >
        <div />
        {WEEKDAYS.map((label, i) => {
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + i);
          const isToday = todayCol === i;
          return (
            <div
              key={label}
              data-day-col={i}
              data-today={isToday || undefined}
              className="flex items-baseline gap-2 px-3.5 py-3"
              style={{
                borderLeft: "1px solid var(--hairline-soft, var(--border))",
                background: isToday
                  ? "var(--primary-disabled, transparent)"
                  : undefined,
              }}
            >
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
              <span
                className="font-semibold text-lg"
                style={{
                  color: isToday
                    ? "var(--primary-active, var(--primary))"
                    : "var(--ink, var(--foreground))",
                }}
              >
                {dayDate.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: GRID_MAX_HEIGHT }}>
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: "64px repeat(5, 1fr)",
            height: `${GRID_PX}px`,
          }}
        >
          <div
            className="relative"
            style={{
              borderRight: "1px solid var(--hairline-soft, var(--border))",
            }}
          >
            {hours.map((h) => (
              <div
                key={`hour-${h}`}
                className="absolute right-0 left-0 px-2 text-right"
                style={{
                  top: `${(h - HOUR_START) * SLOT_PX}px`,
                  borderTop:
                    h === HOUR_START
                      ? "none"
                      : "1px solid var(--hairline-soft, var(--border))",
                }}
              >
                <span className="inline-block translate-y-[-6px] font-mono text-[10px] text-muted-foreground">
                  {fmtHour(h)}
                </span>
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
      </div>
      {conflicts.length > 0 && <ConflictBanner pairs={conflicts} now={now} />}
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
      className="relative"
      style={{
        borderLeft:
          dayIdx === 0
            ? "none"
            : "1px solid var(--hairline-soft, var(--border))",
      }}
    >
      {slots.map((h, hi) => (
        <div
          key={`slot-${h}`}
          className="absolute right-0 left-0"
          style={{
            top: `${(h - HOUR_START) * SLOT_PX}px`,
            height: `${SLOT_PX}px`,
            borderTop:
              hi === 0
                ? "none"
                : "1px solid var(--hairline-soft, var(--border))",
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
  const blockHeight = Math.max(16, height - 2);
  const compact = blockHeight < 40;
  const timeLabel = `${fmtMinutes(event.start)}–${fmtMinutes(event.end)}`;
  return (
    <article
      aria-label={event.title}
      data-event-id={event.id}
      data-kind={event.kind}
      data-conflict={isConflict || undefined}
      className={cn(
        "absolute overflow-hidden rounded-md font-semibold text-[11px] leading-tight",
        compact
          ? "flex items-center gap-1.5 px-2 py-0.5"
          : "flex flex-col px-2 py-1.5",
        tone,
        isConflict && "ring-1 ring-destructive/40",
      )}
      style={{
        top: `${top + 1}px`,
        height: `${blockHeight}px`,
        left: `calc(${leftPct}% + 3px)`,
        width: `calc(${widthPct}% - 6px)`,
        ...(hatched ?? {}),
      }}
    >
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      <span
        className={cn(
          "block font-mono text-[10px] opacity-75",
          compact ? "shrink-0" : "mt-auto",
        )}
      >
        {timeLabel}
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
  const hours = Array.from({ length: HOURS }, (_, i) => HOUR_START + i);

  return (
    <section
      aria-label="Day grid"
      className="overflow-hidden rounded-lg bg-card"
      style={{ border: "1px solid var(--hairline-soft, var(--border))" }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: GRID_MAX_HEIGHT }}>
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: "64px 1fr",
            height: `${GRID_PX}px`,
          }}
        >
          <div
            className="relative"
            style={{
              borderRight: "1px solid var(--hairline-soft, var(--border))",
            }}
          >
            {hours.map((h) => (
              <div
                key={`hour-${h}`}
                className="absolute right-0 left-0 px-2 text-right"
                style={{
                  top: `${(h - HOUR_START) * SLOT_PX}px`,
                  borderTop:
                    h === HOUR_START
                      ? "none"
                      : "1px solid var(--hairline-soft, var(--border))",
                }}
              >
                <span className="inline-block translate-y-[-6px] font-mono text-[10px] text-muted-foreground">
                  {fmtHour(h)}
                </span>
              </div>
            ))}
          </div>
          <div
            data-day-col={dayCol}
            data-today={todayCol === dayCol || undefined}
            className="relative"
          >
            {slots.map((h, hi) => (
              <div
                key={`slot-${h}`}
                className="absolute right-0 left-0"
                style={{
                  top: `${(h - HOUR_START) * SLOT_PX}px`,
                  height: `${SLOT_PX}px`,
                  borderTop:
                    hi === 0
                      ? "none"
                      : "1px solid var(--hairline-soft, var(--border))",
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
      className="overflow-hidden rounded-lg bg-card"
      style={{ border: "1px solid var(--hairline-soft, var(--border))" }}
    >
      <div
        className="grid grid-cols-7"
        style={{
          borderBottom: "1px solid var(--hairline-soft, var(--border))",
        }}
      >
        {headerDays.map((label) => (
          <div
            key={label}
            className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider"
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
              className="min-h-24 p-2"
              style={{
                borderBottom: "1px solid var(--hairline-soft, var(--border))",
                borderLeft: "1px solid var(--hairline-soft, var(--border))",
                background: isToday
                  ? "var(--primary-disabled, transparent)"
                  : !cell.inMonth
                    ? "var(--surface-strong, var(--muted))"
                    : undefined,
              }}
            >
              <div
                className="font-semibold text-xs"
                style={{
                  color: isToday
                    ? "var(--primary-active, var(--primary))"
                    : cell.inMonth
                      ? "var(--ink, var(--foreground))"
                      : "var(--muted-foreground)",
                }}
              >
                {dayNum}
              </div>
              {count > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {cell.events.slice(0, 3).map((ev) => (
                    <li
                      key={ev.signal.id}
                      className="truncate rounded-xs px-1.5 py-0.5 font-medium text-[10px] text-primary-foreground"
                      style={{ background: "var(--primary)" }}
                    >
                      {ev.signal.title}
                    </li>
                  ))}
                  {count > 3 && (
                    <li className="px-1 font-mono text-[10px] text-muted-foreground">
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
      style={{
        borderTop: "1px solid var(--hairline-soft, var(--border))",
        background: "var(--danger-soft, rgba(193,53,21,0.08))",
      }}
    >
      <ul
        className="divide-y"
        style={{ color: "var(--ink, var(--foreground))" }}
      >
        {pairs.map((p) => (
          <li
            key={`${p.a.id}-${p.b.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
            style={{
              borderColor: "var(--hairline-soft, var(--border))",
            }}
          >
            <span
              className="inline-flex items-center gap-1 rounded-xs px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary-foreground"
              style={{ background: "var(--destructive, #c13515)" }}
            >
              <AlertTriangle className="h-3 w-3" />
              Conflict
            </span>
            <span className="font-semibold text-foreground">
              {dayLabel(weekStart, p.a.day)} · {fmtMinutes(p.a.start)}
            </span>
            <span className="text-foreground">
              <span className="font-medium">{p.a.title}</span> overlaps{" "}
              <span className="font-medium">{p.b.title}</span>
            </span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                className="rounded-md px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
              >
                Decline
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1 font-medium text-xs text-foreground transition-colors hover:bg-secondary"
                style={{
                  background: "var(--canvas, var(--background))",
                  border: "1px solid var(--hairline-soft, var(--border))",
                }}
              >
                Reschedule
              </button>
            </span>
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
