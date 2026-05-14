// Calendar page — week / day / month / agenda views.
// Fixture data is inline; real data wiring (calendar signals API) is a follow-up.

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { CalEvent } from "./cal-event";
import { CAL_ACCOUNTS } from "./cal-event";
import { AgendaGrid, DayTimeline } from "./AgendaGrid";
import { AgendaView } from "./AgendaView";
import { EventDialog } from "./EventDialog";
import { MonthView } from "./MonthView";

// ── Fixture events ────────────────────────────────────────────────────────────
// day: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri (Mon-start week, May 4–8 2026)
// start/end: decimal hours (9.75 = 09:45)

const EVENTS: CalEvent[] = [
  // Monday (today)
  {
    id: "e1",
    day: 0,
    start: 9.0,
    end: 9.75,
    title: "Deep work — Slack adapter",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e2",
    day: 0,
    start: 10.0,
    end: 10.25,
    title: "Standup",
    kind: "meeting",
    account: "cal-work",
    attendees: ["Priya M.", "Joon K.", "Sam R.", "+ 3"],
    location: "https://meet.google.com/abc-defg-hij",
    agenda: "Round-robin: yesterday / today / blockers.",
  },
  {
    id: "e3",
    day: 0,
    start: 11.0,
    end: 11.5,
    title: "1:1 — Maria",
    kind: "meeting",
    account: "cal-work",
    attendees: ["Maria L."],
    location: "https://meet.google.com/xyz-vwxy-zab",
    notes: "Career conversation continues — share L5 wheel snapshot.",
  },
  {
    id: "e4",
    day: 0,
    start: 11.75,
    end: 13.0,
    title: "Deep work — DEV-441",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e5",
    day: 0,
    start: 13.0,
    end: 14.0,
    title: "Lunch w/ Alex",
    kind: "personal",
    account: "cal-personal",
    location: "Roma Caffè",
  },
  {
    id: "e6",
    day: 0,
    start: 14.0,
    end: 14.75,
    title: "Design review — onboarding",
    kind: "meeting",
    account: "cal-team",
    attendees: ["Priya M.", "Joon K.", "Design team"],
    location: "https://meet.google.com/def-ghij-klm",
    agenda: "Walk through onboarding v3 hi-fi flow.",
  },
  {
    id: "e7",
    day: 0,
    start: 15.0,
    end: 16.5,
    title: "Deep work — briefing prompt",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e8",
    day: 0,
    start: 18.0,
    end: 19.0,
    title: "Gym",
    kind: "personal",
    account: "cal-personal",
  },
  // Tuesday — Sprint planning + 1:1 conflict
  {
    id: "e9",
    day: 1,
    start: 10.0,
    end: 11.0,
    title: "Sprint planning",
    kind: "meeting",
    account: "cal-work",
    conflict: true,
  },
  {
    id: "e10",
    day: 1,
    start: 10.0,
    end: 10.5,
    title: "1:1 — Joon",
    kind: "meeting",
    account: "cal-work",
    conflict: true,
    notes: "Re-schedule — conflicts with sprint planning.",
  },
  {
    id: "e11",
    day: 1,
    start: 13.0,
    end: 14.5,
    title: "Deep work — review queue",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e12",
    day: 1,
    start: 15.0,
    end: 15.5,
    title: "Office hours",
    kind: "meeting",
    account: "cal-team",
  },
  // Wednesday
  {
    id: "e13",
    day: 2,
    start: 9.0,
    end: 11.0,
    title: "Deep work — quiet hours arc",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e14",
    day: 2,
    start: 11.0,
    end: 11.5,
    title: "Architecture sync",
    kind: "meeting",
    account: "cal-team",
  },
  {
    id: "e15",
    day: 2,
    start: 14.0,
    end: 15.0,
    title: "Eng all-hands",
    kind: "meeting",
    account: "cal-team",
  },
  {
    id: "e16",
    day: 2,
    start: 19.0,
    end: 20.0,
    title: "Dinner",
    kind: "personal",
    account: "cal-personal",
  },
  // Thursday
  {
    id: "e17",
    day: 3,
    start: 9.0,
    end: 9.25,
    title: "Standup",
    kind: "meeting",
    account: "cal-work",
  },
  {
    id: "e18",
    day: 3,
    start: 10.0,
    end: 12.0,
    title: "Deep work",
    kind: "focus",
    account: "cal-work",
  },
  {
    id: "e19",
    day: 3,
    start: 14.0,
    end: 15.0,
    title: "PR review window",
    kind: "focus",
    account: "cal-work",
  },
  // Friday
  {
    id: "e20",
    day: 4,
    start: 9.0,
    end: 9.25,
    title: "Standup",
    kind: "meeting",
    account: "cal-work",
  },
  {
    id: "e21",
    day: 4,
    start: 11.0,
    end: 11.5,
    title: "Demo",
    kind: "meeting",
    account: "cal-team",
  },
  {
    id: "e22",
    day: 4,
    start: 14.0,
    end: 16.0,
    title: "Deep work — ship",
    kind: "focus",
    account: "cal-work",
  },
];

// ── Day-set configs ───────────────────────────────────────────────────────────

type DayCfg = {
  labels: string[];
  todayIndex: number;
  eventDayOffset: number;
};

const DAY_SETS: Record<string, DayCfg> = {
  sun: {
    labels: ["Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8", "Sat 9"],
    todayIndex: 1,
    eventDayOffset: 1,
  },
  mon: {
    labels: ["Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"],
    todayIndex: 0,
    eventDayOffset: 0,
  },
  sat: {
    labels: ["Sat 2", "Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"],
    todayIndex: 2,
    eventDayOffset: 2,
  },
};

type CalView = "week" | "day" | "month" | "agenda";

// ── Derived stats ─────────────────────────────────────────────────────────────

function focusHours(events: CalEvent[]): number {
  return events
    .filter((e) => e.kind === "focus")
    .reduce((sum, e) => sum + (e.end - e.start), 0);
}

function conflictCount(events: CalEvent[]): number {
  const ids = new Set(events.filter((e) => e.conflict).map((e) => e.id));
  // Pairs: each conflict event participates in at least one conflict pair.
  // For simplicity, count unique conflicting events / 2.
  return Math.floor(ids.size / 2);
}

// ── KindLegend ────────────────────────────────────────────────────────────────

function KindLegend({
  label,
  pattern,
}: {
  label: string;
  pattern: "solid" | "outline" | "stripes";
}) {
  const bgStyle =
    pattern === "outline"
      ? {
          background: "transparent",
          border: "1.5px solid var(--border-strong, var(--border))",
        }
      : pattern === "stripes"
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

export function CalendarPage() {
  const [view, setView] = useState<CalView>("week");
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  // Fixed to Mon-start week for the fixture.
  const cfg: DayCfg = DAY_SETS.mon;
  const focusH = focusHours(EVENTS);
  const conflicts = conflictCount(EVENTS);

  const headerLabel =
    view === "day"
      ? "Mon, May 4 2026"
      : view === "month"
        ? "May 2026"
        : "May 4 – 8, 2026";

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
          <Button variant="outline" size="sm">
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Previous">
            <ChevronLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next">
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
            {headerLabel}
          </span>
          <span
            style={{ fontSize: 12, color: "var(--muted-foreground)" }}
          >
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
          {CAL_ACCOUNTS.map((a) => (
            <span
              key={a.id}
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
                  background: a.color,
                }}
              />
              <span
                style={{ color: "var(--foreground)", fontWeight: 500 }}
              >
                {a.short}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--muted-foreground)",
                }}
              >
                {a.label}
              </span>
            </span>
          ))}
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
          <KindLegend label="Meeting" pattern="outline" />
          <KindLegend label="Conflict" pattern="stripes" />
        </div>

        {/* Active view */}
        {view === "week" && (
          <AgendaGrid
            days={cfg.labels}
            todayIndex={cfg.todayIndex}
            eventDayOffset={cfg.eventDayOffset}
            events={EVENTS}
            onEventClick={setSelectedEvent}
          />
        )}
        {view === "day" && (
          <DayTimeline
            events={EVENTS}
            onEventClick={setSelectedEvent}
          />
        )}
        {view === "month" && <MonthView events={EVENTS} />}
        {view === "agenda" && (
          <AgendaView
            days={cfg.labels}
            eventDayOffset={cfg.eventDayOffset}
            events={EVENTS}
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
