export type PulseBarsDatum = {
  day: string;
  prs: number;
  tickets: number;
};

export function PulseBars({
  data,
  height = 90,
}: {
  data: PulseBarsDatum[];
  height?: number;
}) {
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.prs, d.tickets)),
  );
  const slot = 46;
  const width = 8 + data.length * slot;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 22}`}
      width="100%"
      height={height + 22}
      role="img"
      aria-label="Shipped this week, PRs and tickets per weekday"
    >
      {data.map((d, i) => {
        const x = 8 + i * slot;
        const ph = (d.prs / max) * height;
        const th = (d.tickets / max) * height;
        return (
          <g key={d.day} data-pulse-bar-group="">
            <rect
              x={x}
              y={height - ph}
              width={16}
              height={ph}
              fill="var(--ink)"
              rx={2}
              data-pulse-bar="prs"
            />
            <rect
              x={x + 18}
              y={height - th}
              width={16}
              height={th}
              fill="var(--accent)"
              opacity={0.85}
              rx={2}
              data-pulse-bar="tickets"
            />
            <text
              x={x + 17}
              y={height + 14}
              textAnchor="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fill: "var(--muted-soft)",
                letterSpacing: 0.3,
              }}
            >
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
