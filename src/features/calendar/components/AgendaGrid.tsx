// Week timeline (AgendaGrid) and single-day timeline (DayTimeline).
// Both share the DayColumn sub-component and the NowCursor.

import { useEffect, useRef, useState } from "react";
import type { CalEvent } from "./cal-event";
import {
  HOURS_24,
  ROW_H,
  SCROLL_TO_HOUR,
  VISIBLE_H,
  buildConflictLayout,
} from "./cal-event";
import { EventBlock } from "./EventBlock";

// ── NowCursor ─────────────────────────────────────────────────────────────────

function calcNowPx(): number {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) * ROW_H;
}

/** Horizontal hairline + left dot tracking the current local time. Updates each minute. */
export function NowCursor() {
  const [px, setPx] = useState(calcNowPx);

  useEffect(() => {
    const id = setInterval(() => setPx(calcNowPx()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      data-testid="now-cursor"
      aria-label="Current time"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: px,
        height: 2,
        background: "var(--primary)",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--primary)",
          position: "absolute",
          left: -4,
          top: -3,
        }}
      />
    </div>
  );
}

// ── DayColumn ─────────────────────────────────────────────────────────────────

type DayColProps = {
  isToday: boolean;
  events: CalEvent[];
  layout: Map<string, { col: number; of: number }>;
  onEventClick: (e: CalEvent) => void;
};

function DayColumn({ isToday, events, layout, onEventClick }: DayColProps) {
  return (
    <div
      style={{
        position: "relative",
        borderLeft: "1px solid var(--hairline-soft)",
        height: HOURS_24.length * ROW_H,
        minWidth: 0,
      }}
    >
      {HOURS_24.map((h, i) => (
        <div
          key={h}
          style={{
            height: ROW_H,
            borderTop: i === 0 ? "none" : "1px solid var(--hairline-soft)",
          }}
        />
      ))}

      {isToday && <NowCursor />}

      {events.map((e) => (
        <EventBlock
          key={e.id}
          event={e}
          conflictSlot={layout.get(e.id)}
          onClick={() => onEventClick(e)}
        />
      ))}
    </div>
  );
}

// ── AgendaGrid (week timeline) ────────────────────────────────────────────────

type AgendaGridProps = {
  days: string[];
  todayIndex: number;
  /** Added to e.day to map event day index → column index. */
  eventDayOffset: number;
  events: CalEvent[];
  onEventClick: (e: CalEvent) => void;
};

export function AgendaGrid({
  days,
  todayIndex,
  eventDayOffset,
  events,
  onEventClick,
}: AgendaGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layout = buildConflictLayout(events);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * ROW_H;
    }
  }, []);

  return (
    <div
      style={{
        overflow: "hidden",
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      {/* Sticky header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
          borderBottom: "1px solid var(--hairline)",
          background: "var(--surface-card)",
        }}
      >
        <div />
        {days.map((d, i) => (
          <div
            key={d}
            style={{
              padding: "10px 14px",
              borderLeft: "1px solid var(--hairline-soft)",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              background:
                i === todayIndex ? "var(--primary-disabled)" : "transparent",
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
              {d.split(" ")[0]}
            </span>
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                color:
                  i === todayIndex
                    ? "var(--primary)"
                    : "var(--foreground)",
              }}
            >
              {d.split(" ")[1]}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable 24-h body */}
      <div
        ref={scrollRef}
        style={{ height: VISIBLE_H, overflowY: "auto" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
            position: "relative",
          }}
        >
          {/* Hour labels column */}
          <div style={{ borderRight: "1px solid var(--hairline-soft)" }}>
            {HOURS_24.map((h, i) => (
              <div
                key={h}
                style={{
                  height: ROW_H,
                  padding: "0 8px",
                  textAlign: "right",
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--muted-foreground)",
                    transform: "translateY(-6px)",
                    display: "inline-block",
                  }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((d, di) => (
            <DayColumn
              key={d}
              isToday={di === todayIndex}
              events={events.filter((e) => e.day + eventDayOffset === di)}
              layout={layout}
              onEventClick={onEventClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DayTimeline (single-day view) ─────────────────────────────────────────────

type DayTimelineProps = {
  events: CalEvent[];
  onEventClick: (e: CalEvent) => void;
};

export function DayTimeline({ events, onEventClick }: DayTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layout = buildConflictLayout(events);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * ROW_H;
    }
  }, []);

  return (
    <div
      style={{
        overflow: "hidden",
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div
        ref={scrollRef}
        style={{ height: VISIBLE_H, overflowY: "auto" }}
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "60px 1fr" }}
        >
          <div style={{ borderRight: "1px solid var(--hairline-soft)" }}>
            {HOURS_24.map((h, i) => (
              <div
                key={h}
                style={{
                  height: ROW_H,
                  padding: "0 8px",
                  textAlign: "right",
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--muted-foreground)",
                    transform: "translateY(-6px)",
                    display: "inline-block",
                  }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
          <DayColumn
            isToday
            events={events.filter((e) => e.day === 0)}
            layout={layout}
            onEventClick={onEventClick}
          />
        </div>
      </div>
    </div>
  );
}
