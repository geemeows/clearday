export type DonutSlice = { k: string; v: number; c: string };

export function PulseDonut({
  data,
  size = 120,
}: {
  data: DonutSlice[];
  size?: number;
}) {
  const total = (data || []).reduce((a, b) => a + b.v, 0);
  if (!total) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "2px dashed var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-soft)",
          fontSize: 10,
          textAlign: "center",
          padding: 8,
        }}
      >
        No signals
      </div>
    );
  }
  const C = 2 * Math.PI * 44;
  let off = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <g transform="translate(60 60) rotate(-90)">
        {data.map((d, i) => {
          const len = (d.v / total) * C;
          const el = (
            <circle
              key={i}
              r="44"
              cx="0"
              cy="0"
              fill="none"
              stroke={d.c}
              strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-off}
            />
          );
          off += len;
          return el;
        })}
      </g>
      <text
        x="60"
        y="58"
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          fill: "var(--ink)",
        }}
      >
        {total}
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fill: "var(--muted-soft)",
          letterSpacing: 0.3,
        }}
      >
        signals
      </text>
    </svg>
  );
}
