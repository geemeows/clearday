import { CalendarIcon, VideoIcon } from "lucide-react";
import { AvatarGroup } from "#/components/AvatarGroup";
import { Button } from "#/components/ui/button";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";

export type CountdownState = {
  mm: string;
  ss: string;
  minutes: number;
  pct: number;
};

export type NowAttendee = {
  name?: string | null;
  email?: string | null;
};

export type NowSignal = {
  title: string;
  when: string;
  agenda?: string[];
  join?: string;
  attendees?: NowAttendee[];
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

// Human-friendly "starts in" copy. Avoids absurd values like "2635M" by
// rolling up to hours and then to a day-of-week label past 24h.
function fmtStartsIn(iso: string, minutes: number): string {
  if (minutes < 60) return `STARTS IN ${minutes}M`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `STARTS IN ${h}H` : `STARTS IN ${h}H ${m}M`;
  }
  const target = new Date(iso);
  const now = new Date();
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();
  if (sameDay) return `STARTS LATER TODAY`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();
  if (isTomorrow) return `STARTS TOMORROW`;
  const day = target.toLocaleDateString([], { weekday: "short" }).toUpperCase();
  return `STARTS ${day}`;
}

type Props = {
  signal: NowSignal;
  cd: CountdownState;
  onJoin?: () => void;
  onOpenAgenda?: () => void;
};

const URGENT_BG = "#1b1b1b";
const URGENT_FG = "#ffffff";

export function MeetingCountdownNow({
  signal,
  cd,
  onJoin,
  onOpenAgenda,
}: Props) {
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
            color: urgent ? "rgba(255,255,255,.55)" : "var(--muted-foreground)",
            textTransform: "uppercase",
          }}
        >
          {urgent ? (
            <>UNTIL {signal.title.split("—")[0].trim().toUpperCase()}</>
          ) : (
            <>
              {fmtStartsIn(signal.when, cd.minutes)} ·{" "}
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
              color: urgent
                ? "rgba(255,255,255,.6)"
                : "var(--muted-foreground)",
            }}
          >
            {fmtClockTime(signal.when)}
            {signal.join ? " · Google Meet" : ""}
            {signal.attendees && signal.attendees.length > 0
              ? ` · ${signal.attendees.length} attendee${signal.attendees.length === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 600,
            marginBottom:
              signal.attendees && signal.attendees.length > 0 ? 8 : 10,
            color: urgent ? URGENT_FG : "var(--ink)",
          }}
        >
          {signal.title}
        </div>
        {signal.attendees && signal.attendees.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <AvatarGroup people={signal.attendees} max={5} size="sm" />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {(signal.agenda ?? []).slice(0, 3).map((line) => (
            <div
              key={line}
              style={{
                fontSize: 12,
                color: urgent
                  ? "rgba(255,255,255,.7)"
                  : "var(--body, var(--muted))",
                display: "flex",
                gap: 8,
              }}
            >
              <span
                style={{
                  color: urgent ? "rgba(255,255,255,.35)" : "var(--muted-soft)",
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
          style={
            urgent ? { background: "var(--primary)", color: "#fff" } : undefined
          }
        >
          <VideoIcon size={14} />
          Join meeting
        </Button>
        <Button
          variant={urgent ? "ghost" : "outline"}
          size="sm"
          onClick={onOpenAgenda}
          className={
            urgent
              ? "border-white/20 text-white hover:bg-white/10 hover:text-white data-pressed:bg-white/10"
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
