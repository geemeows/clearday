// Focus active block — the dark countdown card that replaces the sidebar
// "Start focus" CTA when a session is active (per PRD #29 issue #39).
//
// Pure presentational deep module: takes the initial remaining seconds
// and the session total, ticks its own internal countdown each second,
// and renders mm:ss + a thin primary progress bar + the "Slack DND on ·
// Calendar busy" caption. Reaching zero is bounded — the parent owns
// session lifecycle and will swap this component back to the CTA on
// completion.

import { useEffect, useState } from "react";

export type FocusActiveBlockProps = {
  remainingSeconds: number;
  totalSeconds: number;
};

export function FocusActiveBlock({
  remainingSeconds,
  totalSeconds,
}: FocusActiveBlockProps) {
  const [remaining, setRemaining] = useState(() =>
    clampNonNeg(remainingSeconds),
  );

  // Reset when the parent passes a new session.
  useEffect(() => {
    setRemaining(clampNonNeg(remainingSeconds));
  }, [remainingSeconds]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const fillPct =
    totalSeconds > 0
      ? Math.min(
          100,
          Math.max(0, ((totalSeconds - remaining) / totalSeconds) * 100),
        )
      : 0;

  return (
    <output
      aria-label="Focus session active"
      data-focus-active="true"
      className="block rounded-md bg-foreground p-3 text-background"
    >
      <div
        role="timer"
        aria-label="Time remaining"
        className="font-mono font-semibold text-lg tabular-nums"
      >
        {pad(mm)}:{pad(ss)}
      </div>
      <div
        role="progressbar"
        aria-label="Focus progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fillPct)}
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background/20"
      >
        <div
          data-testid="focus-progress-fill"
          className="h-full bg-primary"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-background/70">
        Slack DND on · Calendar busy
      </div>
    </output>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clampNonNeg(n: number): number {
  return n > 0 ? Math.floor(n) : 0;
}
