import { VideoIcon } from "lucide-react";
import { Button } from "#/components/ui/button";

export type ScheduleBlock = {
  t: string;
  end: string;
  title: string;
  kind: "focus" | "meeting" | "break" | "buffer";
  join?: boolean;
};

type Props = {
  schedule: ScheduleBlock[];
  /** Display label for the current time cursor (e.g. "10:00"). */
  nowCursor?: string;
  dateLabel?: string;
  timeLabel?: string;
};

const KIND_COLOR: Record<ScheduleBlock["kind"], string> = {
  focus: "var(--ink)",
  meeting: "var(--primary)",
  break: "var(--surface-strong)",
  buffer: "var(--hairline)",
};

const KIND_SUB: Record<ScheduleBlock["kind"], string> = {
  focus: "deep work · DND",
  meeting: "google meet",
  break: "blocked",
  buffer: "buffer",
};

export function TodaySchedule({
  schedule,
  nowCursor,
  dateLabel = "Mon · May 4",
  timeLabel,
}: Props) {
  const now = new Date();
  const currentTimeLabel =
    timeLabel ??
    now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--hairline-soft)",
        background: "var(--surface-card)",
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
          Today
        </span>
        <span
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: "var(--muted-foreground)",
          }}
        >
          {dateLabel}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {currentTimeLabel}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {schedule.map((b) => {
          const isCurrent = nowCursor ? b.t === nowCursor : false;
          const isBreak = b.kind === "break";
          return (
            <div
              key={`${b.t}-${b.title}`}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 6px 1fr auto",
                gap: 14,
                alignItems: "center",
                padding: "8px 0",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--muted-foreground)",
                  fontSize: 11,
                  textAlign: "right",
                }}
              >
                {b.t}
                <span style={{ color: "var(--muted-soft)" }}> – {b.end}</span>
              </div>
              <div
                style={{
                  width: 6,
                  height: "100%",
                  background: KIND_COLOR[b.kind],
                  borderRadius: 999,
                  minHeight: 28,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: isCurrent ? 700 : 500,
                    color: isBreak ? "var(--muted-foreground)" : "var(--ink)",
                  }}
                >
                  {b.title}
                  {isCurrent && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: "1px 8px",
                        borderRadius: 999,
                        background:
                          "var(--primary-disabled, color-mix(in oklab, var(--primary) 15%, transparent))",
                        color: "var(--primary-active, var(--primary))",
                        fontWeight: 600,
                        letterSpacing: 0.3,
                      }}
                    >
                      NOW
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--muted-foreground)",
                    marginTop: 1,
                  }}
                >
                  {KIND_SUB[b.kind]}
                </div>
              </div>
              {b.join && (
                <Button variant="outline" size="xs">
                  <VideoIcon size={12} />
                  Join
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
