// Calendar page — week / day / month / agenda views.
// Events come from the route loader via StoredSignal[]; all fixture data removed.

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { accountColor } from "#/features/calendar/account-color";
import {
  eventsByMonthGrid,
  eventsForDay,
  localDayStart,
  toMeetingEvents,
} from "#/features/calendar/events";
import type { StoredSignal } from "#/shared/signal";
import { AgendaGrid, DayTimeline } from "./AgendaGrid";
import { AgendaView } from "./AgendaView";
import { EventDialog } from "./EventDialog";
import { MonthView } from "./MonthView";
import type { CalEvent, CalEventKind } from "./cal-event";
import { buildConflictLayout } from "./cal-event";

// ── Types ─────────────────────────────────────────────────────────────────────

type CalView = "week" | "day" | "month" | "agenda";

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  // JS: 0=Sun, 1=Mon … 6=Sat → offset to Monday
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("en-US", opts);
}

function headerLabel(view: CalView, anchor: Date, weekMonday: Date): string {
  if (view === "day") {
    return fmt(anchor, {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (view === "month") {
    return fmt(anchor, { month: "long", year: "numeric" });
  }
  // week / agenda: Mon–Sun range
  const weekSun = new Date(weekMonday);
  weekSun.setDate(weekMonday.getDate() + 6);
  return `${fmt(weekMonday, { month: "short", day: "numeric" })} – ${fmt(weekSun, { month: "short", day: "numeric", year: "numeric" })}`;
}

// ── Converter: MeetingEvent → CalEvent ────────────────────────────────────────

function toCalEvents(
  meetingEvents: ReturnType<typeof toMeetingEvents>,
  weekMonday: Date,
): CalEvent[] {
  const monStart = localDayStart(weekMonday).getTime();
  const result: CalEvent[] = [];
  for (const ev of meetingEvents) {
    const evDay = localDayStart(ev.startsAt).getTime();
    const day = Math.round((evDay - monStart) / 86400000);
    if (day < 0 || day > 6) continue;
    const kind: CalEventKind = ev.isFocus ? "focus" : "meeting";
    result.push({
      id: ev.signal.id,
      day,
      start: ev.startsAt.getHours() + ev.startsAt.getMinutes() / 60,
      end: ev.endsAt.getHours() + ev.endsAt.getMinutes() / 60,
      title: ev.signal.title,
      kind,
      account: ev.signal.account_id ?? "__unknown__",
      location:
        typeof ev.signal.payload?.location === "string"
          ? (ev.signal.payload.location as string)
          : ev.videoLink ?? undefined,
      attendees: Array.isArray(ev.signal.payload?.attendees)
        ? (ev.signal.payload.attendees as string[])
        : undefined,
      notes:
        typeof ev.signal.payload?.notes === "string"
          ? (ev.signal.payload.notes as string)
          : undefined,
      agenda:
        typeof ev.signal.payload?.agenda === "string"
          ? (ev.signal.payload.agenda as string)
          : undefined,
    });
  }
  return result;
}

// Single-day CalEvents with day=0 (for DayTimeline single-column layout).
function toDayCalEvents(
  meetingEvents: ReturnType<typeof toMeetingEvents>,
  anchorDay: Date,
): CalEvent[] {
  const dayEvents = eventsForDay(meetingEvents, anchorDay);
  return dayEvents.map((ev) => {
    const kind: CalEventKind = ev.isFocus ? "focus" : "meeting";
    return {
      id: ev.signal.id,
      day: 0,
      start: ev.startsAt.getHours() + ev.startsAt.getMinutes() / 60,
      end: ev.endsAt.getHours() + ev.endsAt.getMinutes() / 60,
      title: ev.signal.title,
      kind,
      account: ev.signal.account_id ?? "__unknown__",
      location:
        typeof ev.signal.payload?.location === "string"
          ? (ev.signal.payload.location as string)
          : ev.videoLink ?? undefined,
      attendees: Array.isArray(ev.signal.payload?.attendees)
        ? (ev.signal.payload.attendees as string[])
        : undefined,
      notes:
        typeof ev.signal.payload?.notes === "string"
          ? (ev.signal.payload.notes as string)
          : undefined,
      agenda:
        typeof ev.signal.payload?.agenda === "string"
          ? (ev.signal.payload.agenda as string)
          : undefined,
    };
  });
}

// ── Derived stats ─────────────────────────────────────────────────────────────

function focusHours(events: CalEvent[]): number {
  return events
    .filter((e) => e.kind === "focus")
    .reduce((sum, e) => sum + (e.end - e.start), 0);
}

function conflictCount(events: CalEvent[]): number {
  const layout = buildConflictLayout(events);
  const conflicting = new Set<string>();
  for (const [id, slot] of layout) {
    if (slot.of > 1) conflicting.add(id);
  }
  return Math.floor(conflicting.size / 2);
}

// ── KindLegend ────────────────────────────────────────────────────────────────

function KindLegend({
  label,
  pattern,
}: {
  label: string;
  pattern: "solid" | "stripes";
}) {
  const bgStyle =
    pattern === "stripes"
      ? {
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(220,38,38,0.18) 0 6px, transparent 6px 10px)",
        }
      : { background: "var(--foreground)" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: "var(--muted-foreground)",
      }}
    >
      <span
        aria-hidden
        style={{ width: 14, height: 12, borderRadius: 3, ...bgStyle }}
      />
      {label}
    </span>
  );
}

// ── CalendarPage ──────────────────────────────────────────────────────────────

type Props = { signals: StoredSignal[] };

export function CalendarPage({ signals }: Props) {
  const [view, setView] = useState<CalView>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  const meetingEvents = useMemo(() => toMeetingEvents(signals), [signals]);

  const weekMonday = useMemo(() => getMondayOf(anchor), [anchor]);

  const weekCalEvents = useMemo(
    () => toCalEvents(meetingEvents, weekMonday),
    [meetingEvents, weekMonday],
  );

  const dayCalEvents = useMemo(
    () => toDayCalEvents(meetingEvents, anchor),
    [meetingEvents, anchor],
  );

  const monthCells = useMemo(
    () => eventsByMonthGrid(meetingEvents, anchor),
    [meetingEvents, anchor],
  );

  // Day labels for AgendaGrid / AgendaView: 7 days Mon–Sun
  const dayLabels = useMemo(() => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + i);
      return `${DAYS[d.getDay()]} ${d.getDate()}`;
    });
  }, [weekMonday]);

  // Index of today in the current week (0=Mon … 6=Sun), or -1 if not this week.
  const todayIndex = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round(
      (today.getTime() - weekMonday.getTime()) / 86400000,
    );
    return diff >= 0 && diff <= 6 ? diff : -1;
  }, [weekMonday]);

  const hLabel = headerLabel(view, anchor, weekMonday);
  const focusH = focusHours(weekCalEvents);
  const conflicts = conflictCount(weekCalEvents);

  // Unique account ids in the current dataset (for the legend)
  const accountIds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const ev of meetingEvents) {
      const id = ev.signal.account_id ?? "__unknown__";
      if (!seen.has(id)) seen.set(id, seen.size);
    }
    return [...seen.entries()];
  }, [meetingEvents]);

  // Navigation
  const goToday = () => {
    setAnchor(new Date());
    setView("day");
  };

  const goPrev = () => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (view === "month") {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 7);
      }
      return d;
    });
  };

  const goNext = () => {
    setAnchor((prev) => {
      const d = new Date(prev);
      if (view === "month") {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
      return d;
    });
  };

  return (
    <main className="flex-1 overflow-auto" aria-label="Calendar">
      <div
        style={{
          padding: "20px 32px 24px",
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.6,
              color: "var(--foreground)",
            }}
          >
            Calendar
          </h1>
          <span style={{ flex: 1 }} />

          {/* Today + navigation */}
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous"
            onClick={goPrev}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next"
            onClick={goNext}
          >
            <ChevronRightIcon />
          </Button>

          <span
            aria-hidden
            style={{
              width: 1,
              height: 20,
              background: "var(--hairline)",
              margin: "0 4px",
            }}
          />

          {/* View switcher */}
          <div
            role="group"
            aria-label="Calendar view"
            style={{
              display: "inline-flex",
              padding: 2,
              gap: 0,
              background: "var(--surface-strong)",
              borderRadius: 999,
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                ["week", "Week"],
                ["day", "Day"],
                ["month", "Month"],
                ["agenda", "Agenda"],
              ] as [CalView, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: "none",
                  background:
                    view === v ? "var(--background)" : "transparent",
                  color:
                    view === v
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow:
                    view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Meta strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: -0.3,
              color: "var(--foreground)",
            }}
          >
            {hLabel}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {conflicts} conflict{conflicts !== 1 ? "s" : ""} ·{" "}
            {focusH.toFixed(1)}h focus scheduled
          </span>
          <span style={{ flex: 1 }} />
        </div>

        {/* Account + kind legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-soft)",
            border: "1px solid var(--hairline)",
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: "var(--muted-foreground)",
            }}
          >
            Accounts
          </span>
          {accountIds.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              No calendar accounts connected
            </span>
          ) : (
            accountIds.map(([id, ordinal]) => {
              const { background } = accountColor(id, ordinal);
              return (
                <span
                  key={id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {id === "__unknown__" ? "Unknown" : id.slice(-8)}
                  </span>
                </span>
              );
            })
          )}
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              color: "var(--muted-foreground)",
            }}
          >
            Kind
          </span>
          <KindLegend label="Focus" pattern="solid" />
          <KindLegend label="Conflict" pattern="stripes" />
        </div>

        {/* Empty state */}
        {meetingEvents.length === 0 && (
          <div
            style={{
              padding: "48px 32px",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: 14,
              background: "var(--surface-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            No calendar events yet. Connect a Google Calendar account in
            Settings → Integrations.
          </div>
        )}

        {/* Active view */}
        {meetingEvents.length > 0 && view === "week" && (
          <AgendaGrid
            days={dayLabels}
            todayIndex={todayIndex}
            eventDayOffset={0}
            events={weekCalEvents}
            onEventClick={setSelectedEvent}
          />
        )}
        {meetingEvents.length > 0 && view === "day" && (
          <DayTimeline
            events={dayCalEvents}
            onEventClick={setSelectedEvent}
          />
        )}
        {meetingEvents.length > 0 && view === "month" && (
          <MonthView cells={monthCells} />
        )}
        {meetingEvents.length > 0 && view === "agenda" && (
          <AgendaView
            days={dayLabels}
            eventDayOffset={0}
            events={weekCalEvents}
            onEventClick={setSelectedEvent}
          />
        )}

        {/* Event detail dialog */}
        <EventDialog
          event={selectedEvent}
          onOpenChange={(open) => {
            if (!open) setSelectedEvent(null);
          }}
        />
      </div>
    </main>
  );
}
