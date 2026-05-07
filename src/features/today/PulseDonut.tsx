import type { PulseSourceKey } from "#/features/signals/views/today";

export type PulseDonutSlice = {
  source: PulseSourceKey;
  count: number;
  color: string;
};

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PulseDonut({
  data,
  size = 120,
}: {
  data: PulseDonutSlice[];
  size?: number;
}) {
  const slices = data.filter((d) => d.count > 0);
  const total = slices.reduce((acc, d) => acc + d.count, 0);
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Signal source mix, ${total} signals`}
    >
      <g transform="translate(60 60) rotate(-90)">
        {total === 0 ? (
          <circle
            r={RADIUS}
            cx={0}
            cy={0}
            fill="none"
            stroke="var(--hairline-soft, var(--border))"
            strokeWidth={14}
          />
        ) : (
          slices.map((d) => {
            const len = (d.count / total) * CIRCUMFERENCE;
            const dashOffset = -offset;
            offset += len;
            return (
              <circle
                key={d.source}
                data-source={d.source}
                r={RADIUS}
                cx={0}
                cy={0}
                fill="none"
                stroke={d.color}
                strokeWidth={14}
                strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
                strokeDashoffset={dashOffset}
              />
            );
          })
        )}
      </g>
      <text
        x={60}
        y={58}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          fill: "var(--ink, currentColor)",
        }}
      >
        {total}
      </text>
      <text
        x={60}
        y={72}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fill: "var(--muted-soft, currentColor)",
          letterSpacing: 0.3,
        }}
      >
        signals
      </text>
    </svg>
  );
}
