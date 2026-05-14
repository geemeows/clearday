import { TargetIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { CountdownRing } from "./CountdownRing";
import type { CountdownState, NowSignal } from "./MeetingCountdownNow";

type Props = {
  signal: NowSignal;
  cd: CountdownState;
  onStartFocus?: () => void;
  onOpenSignal?: () => void;
};

export function FocusReadyNow({ signal, cd, onStartFocus, onOpenSignal }: Props) {
  return (
    <div
      style={{
        borderRadius: 20,
        padding: "28px 28px",
        background: "var(--surface-card)",
        border: "1px solid var(--hairline-soft)",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 24,
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          RIGHT NOW
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.5,
            color: "var(--ink)",
            marginTop: 6,
            marginBottom: 8,
          }}
        >
          Clear runway — {cd.minutes}m until standup
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--muted)",
            marginBottom: 14,
          }}
        >
          Enough time for a focused review pass.{" "}
          <strong style={{ color: "var(--ink)" }}>
            {signal.title.split("—")[0].trim()}
          </strong>{" "}
          is your highest-leverage open thread.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="default" size="default" onClick={onStartFocus}>
            <TargetIcon size={14} />
            Start 25-min focus
          </Button>
          <Button variant="outline" size="default" onClick={onOpenSignal}>
            Open signal
            <ArrowRightIcon size={14} />
          </Button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <CountdownRing minutes={cd.minutes} mm={cd.mm} ss={cd.ss} />
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          {new Date(signal.when).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
