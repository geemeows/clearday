// Month view — 7-column grid with day numbers and event chips.
// Accepts MonthCell[] from eventsByMonthGrid (events.ts) so the grid
// layout is correct for any month in any year, not just May 2026.

import type { MonthCell } from "#/features/calendar/events";

const WEEK_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = { cells: MonthCell[] };

export function MonthView({ cells }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

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
        {cells.map((cell) => {
          const d = cell.day;
          const cellStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const isToday = cellStr === todayStr;
          const titles = cell.events.map((e) => e.signal.title);

          return (
            <div
              key={cellStr}
              style={{
                padding: "6px 8px",
                borderTop: "1px solid var(--hairline-soft)",
                borderLeft: "1px solid var(--hairline-soft)",
                background: isToday
                  ? "color-mix(in oklab, var(--primary) 8%, var(--surface-card))"
                  : "var(--surface-card)",
                opacity: cell.inMonth ? 1 : 0.35,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {d.getDate()}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  marginTop: 3,
                }}
              >
                {titles.slice(0, 3).map((title, k) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable, positional list
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
