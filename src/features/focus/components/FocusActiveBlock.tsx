// Countdown block shown in the sidebar foot when a focus session is active.
// Renders remaining time + a depleting progress bar.

import { useEffect, useState } from "react";

type Props = {
  /** Duration in seconds when the session started. */
  durationSeconds: number;
  /** Epoch ms when the session started. */
  startedAt: number;
};

export function FocusActiveBlock({ durationSeconds, startedAt }: Props) {
  const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, durationSeconds - elapsed()),
  );

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, durationSeconds - elapsed()));
    }, 1000);
    return () => clearInterval(t);
  }, [durationSeconds, startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = durationSeconds > 0 ? remaining / durationSeconds : 0;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: "var(--radius-lg)",
        background: "var(--foreground)",
        color: "var(--background)",
        position: "relative",
        overflow: "hidden",
      }}
      aria-label="Focus session active"
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "color-mix(in oklab, var(--background) 55%, transparent)",
        }}
      >
        FOCUS · ACTIVE
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 4,
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -1,
            fontFamily: "var(--font-mono)",
          }}
          aria-live="off"
        >
          {mm}:{ss}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "color-mix(in oklab, var(--background) 60%, transparent)",
          }}
        >
          remaining
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          height: 3,
          borderRadius: 999,
          background: "color-mix(in oklab, var(--background) 18%, transparent)",
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            background: "var(--background)",
            transition: "width 1s linear",
          }}
        />
      </div>
      <div
        style={{
          fontSize: 11.5,
          marginTop: 8,
          color: "color-mix(in oklab, var(--background) 70%, transparent)",
        }}
      >
        Slack DND on · Calendar busy
      </div>
    </div>
  );
}
