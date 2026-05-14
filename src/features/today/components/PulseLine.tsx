import { ChartEmpty } from "./ChartEmpty";

export function PulseLine({
  values,
  w = 220,
  h = 90,
  color = "var(--primary)",
}: {
  values: number[];
  w?: number;
  h?: number;
  color?: string;
}) {
  if (!values || values.length < 2) {
    return (
      <ChartEmpty
        height={h + 18}
        label="Not enough data"
        sub="Need at least 2 days of activity"
      />
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i): [number, number] => [
    i * stepX,
    h - ((v - min) / (max - min || 1)) * (h - 16) - 8,
  ]);
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h + 18}`}
      width="100%"
      height={h + 18}
      aria-hidden="true"
    >
      <line
        x1="0"
        x2={w}
        y1={h - 8}
        y2={h - 8}
        stroke="var(--hairline-soft)"
        strokeWidth="1"
      />
      <path
        d={path}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r={i === pts.length - 1 ? 4 : 2.5}
          fill={i === pts.length - 1 ? color : "var(--canvas)"}
          stroke={color}
          strokeWidth="1.5"
        />
      ))}
      <text
        x={last[0]}
        y={last[1] - 8}
        textAnchor="end"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          fill: color,
        }}
      >
        {values[values.length - 1]}h
      </text>
    </svg>
  );
}
