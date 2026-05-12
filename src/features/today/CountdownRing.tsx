import { useEffect, useState } from "react";
import { cn } from "#/lib/cn";

export const DEFAULT_LOOKAHEAD_MS = 15 * 60 * 1000;

export type CountdownData = {
  mm: string;
  ss: string;
  totalSeconds: number;
  fraction: number;
};

export function computeCountdown(
  targetIso: string,
  now: Date,
  lookaheadMs: number = DEFAULT_LOOKAHEAD_MS,
): CountdownData {
  const target = Date.parse(targetIso);
  const remainingMs = Number.isNaN(target) ? 0 : target - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const fraction = Math.max(0, Math.min(1, remainingMs / lookaheadMs));
  return { mm, ss, totalSeconds, fraction };
}

export function CountdownRing({
  targetIso,
  lookaheadMs = DEFAULT_LOOKAHEAD_MS,
  label,
  size = 160,
  className,
}: {
  targetIso: string;
  lookaheadMs?: number;
  label?: string;
  size?: number;
  className?: string;
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { mm, ss, fraction } = computeCountdown(targetIso, now, lookaheadMs);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const dash = fraction * circumference;

  return (
    <div
      role="timer"
      aria-label={`${mm}:${ss} remaining`}
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 160 160"
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--hairline-soft, var(--border))"
          strokeWidth="3"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          data-testid="countdown-ring-progress"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-mono font-bold text-[44px] text-foreground tabular-nums leading-none"
          style={{ letterSpacing: "-2px" }}
        >
          <span data-testid="countdown-mm">{mm}</span>
          <span style={{ color: "var(--muted-soft)" }}>:</span>
          <span data-testid="countdown-ss">{ss}</span>
        </div>
        {label && (
          <div className="mt-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
