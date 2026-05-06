export function PulseLine({
  values,
  width = 220,
  height = 90,
  color = "var(--accent)",
  unit = "h",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  unit?: string;
}) {
  if (values.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        width="100%"
        height={height + 18}
        role="img"
        aria-label="Review latency trend"
      />
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const usable = height - 16;
  const points = values.map<[number, number]>((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * usable - 8;
    return [x, y];
  });
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const lastValue = values[values.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height + 18}`}
      width="100%"
      height={height + 18}
      role="img"
      aria-label={`Review latency trend, ${lastValue}${unit}`}
    >
      <line
        x1={0}
        x2={width}
        y1={height - 8}
        y2={height - 8}
        stroke="var(--hairline-soft)"
        strokeWidth={1}
      />
      <path
        d={path}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: positions are stable per render
          key={i}
          data-pulse-point=""
          cx={p[0]}
          cy={p[1]}
          r={i === points.length - 1 ? 4 : 2.5}
          fill={i === points.length - 1 ? color : "var(--canvas)"}
          stroke={color}
          strokeWidth={1.5}
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
        {lastValue}
        {unit}
      </text>
    </svg>
  );
}
