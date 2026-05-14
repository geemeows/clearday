import { type DayBar, PulseBars } from "./PulseBars";
import { type DonutSlice, PulseDonut } from "./PulseDonut";
import { PulseLine } from "./PulseLine";

export type WeekStats = {
  prs_reviewed: number;
  tickets_shipped: number;
  focus_hours: number;
  inbox_zero_days: number;
};

type Props = {
  stats: WeekStats;
  /** When true, renders all charts in their empty states. */
  empty?: boolean;
  updatedAgo?: string;
  sourceMix?: DonutSlice[];
  reviewLatency?: number[];
  shipByDay?: DayBar[];
};

const DEFAULT_SOURCE_MIX: DonutSlice[] = [
  { k: "GitHub", v: 38, c: "var(--src-git)" },
  { k: "Slack", v: 27, c: "var(--src-slack)" },
  { k: "Calendar", v: 18, c: "var(--src-cal)" },
  { k: "Linear", v: 12, c: "var(--src-task)" },
  { k: "AI", v: 5, c: "var(--src-ai)" },
];

const DEFAULT_REVIEW_LATENCY = [9, 11, 7, 6, 8, 5, 4];

const DEFAULT_SHIP_BY_DAY: DayBar[] = [
  { d: "Mon", prs: 2, tickets: 1 },
  { d: "Tue", prs: 3, tickets: 1 },
  { d: "Wed", prs: 1, tickets: 0 },
  { d: "Thu", prs: 4, tickets: 2 },
  { d: "Fri", prs: 2, tickets: 0 },
];

export function PulseCard({
  stats,
  empty = false,
  updatedAgo = "32s ago",
  sourceMix: sourceMixProp,
  reviewLatency: reviewLatencyProp,
  shipByDay: shipByDayProp,
}: Props) {
  const sourceMix = empty ? [] : (sourceMixProp ?? DEFAULT_SOURCE_MIX);
  const reviewLatency = empty ? [] : (reviewLatencyProp ?? DEFAULT_REVIEW_LATENCY);
  const shipByDay = empty
    ? DEFAULT_SHIP_BY_DAY.map((d) => ({ ...d, prs: 0, tickets: 0 }))
    : (shipByDayProp ?? DEFAULT_SHIP_BY_DAY);

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--hairline-soft)",
        background: "var(--surface-card)",
        padding: "22px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 14,
        }}
      >
        <span
          style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}
        >
          Pulse
        </span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          last 7 days
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          updated {updatedAgo}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
        }}
      >
        {/* Donut — signal mix */}
        <div
          style={{
            paddingRight: 20,
            borderRight: "1px solid var(--hairline-soft)",
            display: "flex",
            gap: 14,
            alignItems: "center",
          }}
        >
          <PulseDonut data={sourceMix} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {sourceMix.length === 0 ? (
              <span style={{ fontSize: 11, color: "var(--muted-soft)" }}>
                No signal mix yet
              </span>
            ) : (
              sourceMix.map((s) => (
                <div
                  key={s.k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      background: s.c,
                      borderRadius: 2,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ color: "var(--ink)", minWidth: 56 }}>
                    {s.k}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--muted)",
                    }}
                  >
                    {s.v}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Line — review latency */}
        <div
          style={{
            padding: "0 20px",
            borderRight: "1px solid var(--hairline-soft)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Review latency
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
            median time-to-first-comment, lower is better
          </div>
          <div style={{ marginTop: 8 }}>
            <PulseLine values={reviewLatency} />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color:
                reviewLatency.length >= 2
                  ? "var(--good, #22c55e)"
                  : "var(--muted-soft)",
              fontWeight: 500,
            }}
          >
            {reviewLatency.length >= 2 ? "↓ 5h faster than 7d ago" : "—"}
          </div>
        </div>

        {/* Bars — shipped */}
        <div style={{ paddingLeft: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Shipped this week
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
            PRs merged · Tickets closed
          </div>
          <div style={{ marginTop: 8 }}>
            <PulseBars data={shipByDay} />
          </div>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              gap: 14,
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  background: "var(--ink)",
                  borderRadius: 2,
                  marginRight: 6,
                }}
              />
              {empty ? 0 : stats.prs_reviewed} PRs
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  background: "var(--primary)",
                  borderRadius: 2,
                  marginRight: 6,
                }}
              />
              {empty ? 0 : stats.tickets_shipped} tickets
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
