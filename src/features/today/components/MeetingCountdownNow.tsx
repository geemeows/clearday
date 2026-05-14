import { VideoIcon, CalendarIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";

export type CountdownState = {
  mm: string;
  ss: string;
  minutes: number;
  pct: number;
};

export type NowSignal = {
  title: string;
  when: string;
  agenda?: string[];
  join?: string;
};

function fmtClockTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}

type Props = {
  signal: NowSignal;
  cd: CountdownState;
  onJoin?: () => void;
  onOpenAgenda?: () => void;
};

const URGENT_BG = "#1b1b1b";
const URGENT_FG = "#ffffff";

export function MeetingCountdownNow({ signal, cd, onJoin, onOpenAgenda }: Props) {
  const urgent = cd.minutes <= 10;
  const startLabel = fmtClockTime(signal.when);

  return (
    <div
      style={{
        borderRadius: 20,
        padding: "26px 28px",
        background: urgent ? URGENT_BG : "var(--surface-card)",
        color: urgent ? URGENT_FG : "var(--ink)",
        border: urgent ? "none" : "1px solid var(--hairline-soft)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 24,
        alignItems: "center",
        transition: "background .3s",
      }}
    >
      {/* Timer column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        {urgent ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1,
              color: "var(--primary)",
            }}
          >
            {cd.mm}
            <span style={{ opacity: 0.4 }}>:</span>
            {cd.ss}
          </span>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 56,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1,
              color: "var(--ink)",
            }}
          >
            {startLabel}
          </span>
        )}
        <span
          style={{
            marginTop: 6,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: urgent ? "rgba(255,255,255,.55)" : "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          {urgent ? (
            <>UNTIL {signal.title.split("—")[0].trim().toUpperCase()}</>
          ) : (
            <>
              STARTS IN {cd.minutes}M ·{" "}
              {signal.title.split("—")[0].trim().toUpperCase()}
            </>
          )}
        </span>
      </div>

      {/* Context column */}
      <div
        style={{
          minWidth: 0,
          borderLeft: urgent
            ? "1px solid rgba(255,255,255,.15)"
            : "1px solid var(--hairline-soft)",
          paddingLeft: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <SourceGlyph source="cal" size={16} />
          <span
            style={{
              fontSize: 12,
              color: urgent ? "rgba(255,255,255,.6)" : "var(--muted)",
            }}
          >
            {fmtClockTime(signal.when)} · Google Meet · 9 attendees
          </span>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            marginBottom: 10,
            color: urgent ? URGENT_FG : "var(--ink)",
          }}
        >
          {signal.title}
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 3 }}
        >
          {(signal.agenda ?? []).slice(0, 3).map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: urgent ? "rgba(255,255,255,.7)" : "var(--body, var(--muted))",
                display: "flex",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: urgent
                    ? "rgba(255,255,255,.35)"
                    : "var(--muted-soft)",
                }}
              >
                ·
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "stretch",
          minWidth: 160,
        }}
      >
        <Button
          variant="default"
          size="lg"
          onClick={onJoin}
          style={urgent ? { background: "var(--primary)", color: "#fff" } : undefined}
        >
          <VideoIcon size={14} />
          Join meeting
        </Button>
        <Button
          variant={urgent ? "ghost" : "outline"}
          size="sm"
          onClick={onOpenAgenda}
          style={
            urgent
              ? { color: URGENT_FG, borderColor: "rgba(255,255,255,.2)" }
              : undefined
          }
        >
          <CalendarIcon size={13} />
          Open agenda
        </Button>
      </div>
    </div>
  );
}
