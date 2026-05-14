// DevPlanSection — development plan card with status-tagged items.

import { MoreHorizontalIcon, PlusIcon, RouteIcon, TargetIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import type { Criterion, DevPlanItem, DevPlanStatus } from "./career-data";

const STATUS_MAP: Record<
  DevPlanStatus,
  { label: string; bg: string; fg: string }
> = {
  not_started: {
    label: "Not started",
    bg: "var(--surface-strong)",
    fg: "var(--muted-foreground)",
  },
  in_progress: {
    label: "In progress",
    bg: "var(--accent-tint)",
    fg: "var(--primary)",
  },
  done: {
    label: "Done",
    bg: "var(--good-soft)",
    fg: "var(--good)",
  },
  blocked: {
    label: "Blocked",
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
  },
};

export function DevPlanSection({
  items,
  criteria,
  readOnly,
  onAdd,
  onRemove,
}: {
  items: DevPlanItem[];
  criteria: Criterion[];
  readOnly?: boolean;
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <section
      className="mt-4 rounded-lg border overflow-hidden"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
      }}
    >
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <div
          className="size-[26px] rounded-md inline-flex items-center justify-center shrink-0"
          style={{
            background: "var(--accent-tint)",
            color: "var(--primary)",
          }}
        >
          <RouteIcon className="size-3.5" />
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold text-foreground">
            Development plan
          </div>
          <div
            className="text-[11.5px] mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Concrete items to close the gap toward target — with start and due
            dates.
          </div>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <PlusIcon /> Add item
          </Button>
        )}
      </header>

      <div>
        {items.length === 0 && !readOnly && (
          <button
            type="button"
            onClick={onAdd}
            className="w-[calc(100%-24px)] mx-3 my-3.5 px-3.5 py-3 rounded-md border cursor-pointer inline-flex items-center justify-center gap-1.5 text-[12.5px]"
            style={{
              background: "transparent",
              borderStyle: "dashed",
              borderColor: "var(--border-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            <PlusIcon className="size-3" /> Add your first development plan
            item
          </button>
        )}
        {items.map((it, i) => {
          const status = STATUS_MAP[it.status] ?? STATUS_MAP.not_started;
          const cr = criteria.find((c) => c.id === it.criterion_id);
          return (
            <div
              key={it.id}
              className="grid items-center px-4 py-2.5 gap-3"
              style={{
                gridTemplateColumns: "auto 1fr auto auto auto",
                borderTop: i ? "1px solid var(--hairline-soft)" : "none",
              }}
            >
              <TargetIcon
                className="size-3.5"
                style={{ color: "var(--muted-foreground)" }}
              />
              <div className="min-w-0">
                <div
                  className="text-[13.5px] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {it.title}
                </div>
                {cr && (
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    closes a gap in{" "}
                    <span className="text-foreground">{cr.name}</span>
                  </div>
                )}
              </div>
              <span
                className="font-mono text-[11.5px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {it.start} → {it.due}
              </span>
              <span
                className="text-[10.5px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full"
                style={{ background: status.bg, color: status.fg }}
              >
                {status.label}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="More"
                  onClick={() => onRemove?.(it.id)}
                  className="border-none bg-transparent cursor-pointer inline-flex items-center justify-center rounded size-7"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <MoreHorizontalIcon className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
