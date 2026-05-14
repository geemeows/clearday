type Props = {
  height?: number;
  label?: string;
  sub?: string;
};

export function ChartEmpty({
  height = 90,
  label = "Not enough data yet",
  sub,
}: Props) {
  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed var(--hairline-soft)",
        borderRadius: 6,
        background:
          "repeating-linear-gradient(45deg, transparent 0 6px, var(--surface-soft) 6px 7px)",
        color: "var(--muted-foreground)",
        padding: "8px 12px",
        textAlign: "center",
        gap: 2,
      }}
    >
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--muted-foreground)",
        }}
      >
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: 10.5, color: "var(--muted-soft)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}
