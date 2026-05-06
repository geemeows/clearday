// Pure presentational countdown ring for the Today page Next-up hero.
//
// Takes a target ISO timestamp and renders an SVG ring + mm:ss readout that
// ticks every second. Owns its own setInterval so the parent doesn't need to
// re-render at 1Hz. Window is fixed at 60 minutes — for longer countdowns
// the ring stays full and only the readout changes.

import { useEffect, useState } from "react";

const RING_WINDOW_MS = 60 * 60 * 1000;

export function CountdownRing({
  targetIso,
  size = 96,
  stroke = 6,
}: {
  targetIso: string;
  size?: number;
  stroke?: number;
}) {
  const target = Date.parse(targetIso);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, target - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const label = `${pad2(Math.min(99, mm))}:${pad2(ss)}`;

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = Math.min(1, remainingMs / RING_WINDOW_MS);
  const dashOffset = c * (1 - fraction);

  return (
    <div
      role="timer"
      aria-label="Time until next meeting"
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <title>Countdown</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="text-primary"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute font-mono font-semibold text-foreground text-sm tabular-nums">
        {label}
      </span>
    </div>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
