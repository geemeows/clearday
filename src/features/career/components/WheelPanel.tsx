// WheelPanel — sticky radar panel showing per-criterion scores vs targets.

import { CareerWheel } from "./CareerRadar";
import type { Competency, WheelDataPoint } from "./career-data";

export function WheelPanel({
  criteria,
  competencies,
}: {
  criteria: WheelDataPoint[];
  competencies: Competency[];
}) {
  return (
    <div
      className="sticky top-3 rounded-lg border p-3.5 pb-4"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="mb-2.5">
        <div className="text-[13.5px] font-semibold text-foreground">
          The wheel
        </div>
        <div
          className="text-[11.5px] mt-0.5"
          style={{ color: "var(--muted-foreground)" }}
        >
          Per-criterion current vs. target · {criteria.length} criteria
        </div>
      </div>

      <CareerWheel data={criteria} variant="classic" />

      {competencies.length > 0 && (
        <div
          className="mt-2 pt-2.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px]"
          style={{
            borderTop: "1px solid var(--hairline-soft)",
            color: "var(--muted-foreground)",
          }}
        >
          {competencies.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5"
            >
              <span
                className="size-2 rounded-sm"
                style={{ background: "var(--primary)", opacity: 0.55 }}
              />
              <span>{c.name}</span>
              <span
                className="font-mono"
                style={{ color: "var(--muted-soft)" }}
              >
                · {c.criteria.length}
              </span>
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-center gap-3.5 text-[11px] mt-2 pt-2"
        style={{
          borderTop: "1px solid var(--hairline-soft)",
          color: "var(--muted-foreground)",
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: "var(--primary)", opacity: 0.6 }}
          />
          Current
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-2.5"
            style={{
              height: 0,
              borderTop: "1.5px dashed var(--muted-foreground)",
              display: "inline-block",
            }}
          />
          Target
        </span>
      </div>
    </div>
  );
}
