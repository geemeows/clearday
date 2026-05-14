// ScoreDots — filled dot row for scoring indicators (1–4).

import { CAREER_LEGEND } from "./career-data";

export function ScoreDots({
  value,
  max = 4,
  onChange,
  readOnly,
  target,
}: {
  value: number;
  max?: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
  target?: number;
}) {
  const v = Math.max(1, Math.min(max, value || 1));

  return (
    <div
      className="inline-flex items-center gap-1"
      role="radiogroup"
      aria-label="Score"
    >
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const filled = n <= v;
        const isTarget = typeof target === "number" && n === target;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            role="radio"
            aria-checked={v === n}
            title={CAREER_LEGEND[n]}
            className="size-[11px] rounded-full p-0 transition-all cursor-pointer disabled:cursor-default"
            style={{
              border: filled
                ? "1px solid var(--primary)"
                : "1px solid var(--border-strong)",
              background: filled ? "var(--primary)" : "transparent",
              boxShadow: isTarget
                ? "0 0 0 2px var(--background), 0 0 0 3px var(--foreground)"
                : "none",
            }}
          />
        );
      })}
      <span
        className="font-mono text-muted-foreground ml-1.5 min-w-[26px] text-[11px]"
      >
        {v}/{max}
      </span>
    </div>
  );
}
