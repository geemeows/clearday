// ScoreLegendStrip — explains what scores 1–4 mean. Editable via onEdit.

import { PencilIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { ScoreLegend } from "./career-data";

export function ScoreLegendStrip({
  legend,
  onEdit,
}: {
  legend: ScoreLegend;
  onEdit?: () => void;
}) {
  return (
    <div
      className="mt-3.5 px-3.5 py-2.5 rounded-md border grid items-center gap-3.5"
      style={{
        gridTemplateColumns: "auto repeat(4, 1fr) auto",
        background: "var(--surface-soft)",
        borderColor: "var(--hairline)",
      }}
    >
      <span
        className="text-[9.5px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--muted-foreground)" }}
      >
        Legend
      </span>
      {[1, 2, 3, 4].map((n) => {
        const entry = legend[n] ?? { title: "", desc: "" };
        return (
          <div
            key={n}
            title={entry.desc}
            className="flex items-center gap-2 min-w-0"
          >
            <span className="inline-flex gap-0.5 shrink-0">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="size-[7px] rounded-full"
                  style={{
                    border:
                      i <= n
                        ? "1px solid var(--primary)"
                        : "1px solid var(--border-strong)",
                    background: i <= n ? "var(--primary)" : "transparent",
                  }}
                />
              ))}
            </span>
            <div className="min-w-0 flex flex-col leading-tight">
              <span className="text-[12px] font-semibold text-foreground">
                {n} · {entry.title}
              </span>
              <span
                className="text-[11px] overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ color: "var(--muted-foreground)" }}
              >
                {entry.desc}
              </span>
            </div>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <PencilIcon /> Edit
      </Button>
    </div>
  );
}
