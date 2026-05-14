// Month view — 7-column grid with day numbers and event chips.
// Fixed to the May 2026 fixture layout (May 1 = Thursday, col offset 3).

import type { CalEvent } from "./cal-event";

const WEEK_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = { events: CalEvent[] };

export function MonthView({ events }: Props) {
  // May 2026: 31 days, starts Thursday (Mon-start grid → col index 3).
  // 5 rows × 7 cols = 35 cells; pad 3 cells at start for Mon/Tue/Wed before May 1.
  const cells = Array.from({ length: 35 });

  // Map "day number in May" → event titles for quick lookup.
  // The fixture uses 0-indexed Monday week; May 4 = Monday → dayNum 4.
  const eventsByDay = new Map<number, string[]>();
  for (const e of events) {
    // e.day=0 → Mon May 4, so dayNum = e.day + 4
    const dayNum = e.day + 4;
    const bucket = eventsByDay.get(dayNum) ?? [];
    bucket.push(e.title);
    eventsByDay.set(dayNum, bucket);
  }

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {/* Day-of-week header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: "1px solid var(--hairline)",
          background: "var(--surface-soft)",
        }}
      >
        {WEEK_HEADERS.map((d) => (
          <div
            key={d}
            style={{
              padding: "8px 12px",
              borderLeft: "1px solid var(--hairline-soft)",
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
              {d}
            </span>
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gridAutoRows: 96,
        }}
      >
        {cells.map((_, i) => {
          // i=0..2 → before May 1 (padding cells); i=3 → May 1 (Thu)
          const dayNum = i - 2; // i=3 → dayNum=1
          const inMonth = dayNum >= 1 && dayNum <= 31;
          const isToday = dayNum === 4; // May 4 = Monday fixture "today"
          const evts = inMonth ? (eventsByDay.get(dayNum) ?? []) : [];

          return (
            <div
              key={i}
              style={{
                padding: "6px 8px",
                borderTop: "1px solid var(--hairline-soft)",
                borderLeft: "1px solid var(--hairline-soft)",
                background: isToday
                  ? "color-mix(in oklab, var(--primary) 8%, var(--surface-card))"
                  : "var(--surface-card)",
                opacity: inMonth ? 1 : 0.35,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {inMonth ? dayNum : ""}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  marginTop: 3,
                }}
              >
                {evts.slice(0, 3).map((title, k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: "var(--surface-strong)",
                      color: "var(--foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
