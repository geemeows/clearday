// Empty-state placeholder shown inside a Pulse chart slot when there isn't
// enough data yet, per docs/design/devy-ui/today.jsx ChartEmpty.
export function ChartEmpty({
  height = 90,
  label,
  sub,
}: {
  height?: number;
  label: string;
  sub?: string;
}) {
  return (
    <div
      data-pulse-empty=""
      style={{
        height,
        background:
          "repeating-linear-gradient(45deg, transparent 0 6px, var(--surface-soft) 6px 7px)",
      }}
      className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-[var(--hairline-soft)] border-dashed px-3 py-2 text-center"
    >
      <span className="font-medium text-[var(--muted)] text-[11.5px]">
        {label}
      </span>
      {sub && (
        <span className="text-[10.5px] text-[var(--muted-soft)]">{sub}</span>
      )}
    </div>
  );
}
