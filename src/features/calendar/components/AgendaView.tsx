// Agenda view — flat list of events grouped by day.

import { accountColor } from "#/features/calendar/account-color";
import type { CalEvent } from "./cal-event";
import { fmtCalHour } from "./cal-event";

type Props = {
  days: string[];
  /** Added to e.day to map event day index → column index. */
  eventDayOffset: number;
  events: CalEvent[];
  onEventClick: (e: CalEvent) => void;
};

export function AgendaView({
  days,
  eventDayOffset,
  events,
  onEventClick,
}: Props) {
  const grouped = days.map((label, di) => ({
    label,
    events: events
      .filter((e) => e.day + eventDayOffset === di)
      .sort((a, b) => a.start - b.start),
  }));

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {grouped.map((g, i) => (
        <div
          key={g.label}
          style={{ borderTop: i ? "1px solid var(--hairline)" : "none" }}
        >
          {/* Day header */}
          <div
            style={{ padding: "10px 16px", background: "var(--surface-soft)" }}
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
              {g.label}
            </span>
            <span
              style={{
                marginLeft: 8,
                fontSize: 11.5,
                color: "var(--muted-foreground)",
              }}
            >
              {g.events.length} event{g.events.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Event rows */}
          {g.events.map((e) => {
            const { background } = accountColor(e.account);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onEventClick(e)}
                aria-label={e.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px auto 1fr",
                  gap: 12,
                  alignItems: "center",
                  width: "100%",
                  padding: "10px 16px",
                  textAlign: "left",
                  border: "none",
                  borderTop: "1px solid var(--hairline-soft)",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {fmtCalHour(e.start)} – {fmtCalHour(e.end)}
                </span>
                <span
                  aria-hidden
                  style={{
                    width: 4,
                    height: 22,
                    borderRadius: 2,
                    background,
                  }}
                />
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "var(--foreground)",
                  }}
                >
                  {e.title}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
