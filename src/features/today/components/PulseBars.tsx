import { ChartEmpty } from "./ChartEmpty";

export type DayBar = { d: string; prs: number; tickets: number };

export function PulseBars({ data, h = 90 }: { data: DayBar[]; h?: number }) {
  if (!data || !data.length || !data.some((d) => d.prs || d.tickets)) {
    return (
      <ChartEmpty
        height={h + 22}
        label="Nothing shipped yet this week"
        sub="Bars will appear once a PR merges or a ticket closes"
      />
    );
  }
  const max = Math.max(...data.map((d) => Math.max(d.prs, d.tickets)));
  return (
    <svg
      viewBox={`0 0 240 ${h + 22}`}
      width="100%"
      height={h + 22}
      aria-hidden="true"
    >
      {data.map((d, i) => {
        const x = 8 + i * 46;
        const ph = max > 0 ? (d.prs / max) * h : 0;
        const th = max > 0 ? (d.tickets / max) * h : 0;
        return (
          <g key={i}>
            <rect x={x} y={h - ph} width={16} height={ph} fill="var(--ink)" rx={2} />
            <rect
              x={x + 18}
              y={h - th}
              width={16}
              height={th}
              fill="var(--primary)"
              opacity={0.85}
              rx={2}
            />
            <text
              x={x + 17}
              y={h + 14}
              textAnchor="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fill: "var(--muted-soft)",
                letterSpacing: 0.3,
              }}
            >
              {d.d}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
