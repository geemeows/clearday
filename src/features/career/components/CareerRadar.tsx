// Career radar chart — three visual variants: classic / petals / rings.
// Mirrors career-wheel.jsx from docs/design/devy-unbundled/.

import type { WheelDataPoint } from "./career-data";

type Variant = "classic" | "petals" | "rings";

// 12 o'clock = -90°, clockwise.
function polar(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function polygonPoints(
  cx: number,
  cy: number,
  radii: number[],
  angles: number[],
): string {
  return radii
    .map((r, i) => polar(cx, cy, r, angles[i]).join(","))
    .join(" ");
}

function labelAnchor(a: number): "start" | "end" | "middle" {
  if (a > 5 && a < 175) return "start";
  if (a > 185 && a < 355) return "end";
  return "middle";
}

function labelDy(a: number): number {
  if (a > 95 && a < 265) return 12;
  if (a < 5 || a > 355 || (a > 175 && a < 185)) return 4;
  return 0;
}

// ── Classic radar ─────────────────────────────────────────────────────────────

function WheelClassic({
  data,
  max = 4,
  size = 360,
}: {
  data: WheelDataPoint[];
  max?: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const angles = data.map((_, i) => (360 / n) * i);
  const rings = [1, 2, 3, 4];
  const targetRadii = data.map((d) => (d.target / max) * R);
  const currentRadii = data.map((d) => (d.current / max) * R);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ display: "block" }}
      aria-label="Career wheel"
    >
      {rings.map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={(r / max) * R}
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="1"
        />
      ))}
      {angles.map((a, i) => {
        const [x, y] = polar(cx, cy, R, a);
        return (
          <line
            key={`axis-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--hairline-soft)"
            strokeWidth="1"
          />
        );
      })}
      <polygon
        points={polygonPoints(cx, cy, targetRadii, angles)}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1.25"
        strokeDasharray="4 3"
        opacity="0.7"
      />
      <polygon
        points={polygonPoints(cx, cy, currentRadii, angles)}
        fill="var(--primary)"
        fillOpacity="0.18"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {data.map((d, i) => {
        const [x, y] = polar(cx, cy, currentRadii[i] ?? 0, angles[i] ?? 0);
        return (
          <circle
            key={d.id}
            cx={x}
            cy={y}
            r="3.5"
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth="1.5"
          />
        );
      })}
      {data.map((d, i) => {
        const [lx, ly] = polar(cx, cy, R + 26, angles[i] ?? 0);
        const a = angles[i] ?? 0;
        return (
          <g key={`label-${d.id}`}>
            <text
              x={lx}
              y={ly + labelDy(a)}
              textAnchor={labelAnchor(a)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                fill: "var(--foreground)",
              }}
            >
              {d.name}
            </text>
            <text
              x={lx}
              y={ly + labelDy(a) + 13}
              textAnchor={labelAnchor(a)}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            >
              {d.current.toFixed(1)}{" "}
              <tspan fill="var(--muted-foreground)">
                / {d.target.toFixed(1)}
              </tspan>
            </text>
          </g>
        );
      })}
      {rings.map((r) => (
        <text
          key={`ring-label-${r}`}
          x={cx + 3}
          y={cy - (r / max) * R + 3}
          style={{ fontSize: 9, fill: "var(--muted-soft)", fontWeight: 500 }}
        >
          {r}
        </text>
      ))}
    </svg>
  );
}

// ── Petals ────────────────────────────────────────────────────────────────────

function WheelPetals({
  data,
  max = 4,
  size = 360,
}: {
  data: WheelDataPoint[];
  max?: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const slice = 360 / n;
  const petalArc = slice * 0.62;

  const arcPath = (angleDeg: number, radius: number): string => {
    const half = petalArc / 2;
    const [x1, y1] = polar(cx, cy, radius, angleDeg - half);
    const [x2, y2] = polar(cx, cy, radius, angleDeg + half);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ display: "block" }}
      aria-label="Career petals chart"
    >
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="var(--hairline-soft)"
        strokeWidth="1"
      />
      {[1, 2, 3, 4].map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={(r / max) * R}
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="0.75"
          strokeDasharray="2 3"
          opacity="0.6"
        />
      ))}
      {data.map((d, i) => {
        const angle = slice * i;
        const curR = Math.max(8, (d.current / max) * R);
        const tarR = (d.target / max) * R;
        const [lx, ly] = polar(cx, cy, R + 26, angle);
        const a = angle;
        return (
          <g key={d.id}>
            <path
              d={arcPath(angle, curR)}
              fill="var(--primary)"
              fillOpacity={0.22 + (d.current / max) * 0.45}
              stroke="var(--primary)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <line
              x1={polar(cx, cy, tarR, angle - petalArc / 2)[0]}
              y1={polar(cx, cy, tarR, angle - petalArc / 2)[1]}
              x2={polar(cx, cy, tarR, angle + petalArc / 2)[0]}
              y2={polar(cx, cy, tarR, angle + petalArc / 2)[1]}
              stroke="var(--foreground)"
              strokeWidth="1.25"
              strokeDasharray="2 2"
              opacity="0.65"
            />
            <text
              x={lx}
              y={ly + labelDy(a)}
              textAnchor={labelAnchor(a)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                fill: "var(--foreground)",
              }}
            >
              {d.name}
            </text>
            <text
              x={lx}
              y={ly + labelDy(a) + 13}
              textAnchor={labelAnchor(a)}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            >
              {d.current.toFixed(1)} / {d.target.toFixed(1)}
            </text>
          </g>
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r="6"
        fill="var(--background)"
        stroke="var(--border)"
        strokeWidth="1"
      />
    </svg>
  );
}

// ── Rings ─────────────────────────────────────────────────────────────────────

function WheelRings({
  data,
  max = 4,
  size = 360,
}: {
  data: WheelDataPoint[];
  max?: number;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const angles = data.map((_, i) => (360 / n) * i);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ display: "block" }}
      aria-label="Career rings chart"
    >
      {[1, 2, 3, 4].map((r) => (
        <g key={r}>
          <circle
            cx={cx}
            cy={cy}
            r={(r / max) * R}
            fill="none"
            stroke="var(--hairline-soft)"
            strokeWidth="1"
          />
          <text
            x={cx + 3}
            y={cy - (r / max) * R + 3}
            style={{
              fontSize: 9,
              fill: "var(--muted-soft)",
              fontWeight: 500,
            }}
          >
            {r}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const a = angles[i] ?? 0;
        const [tx, ty] = polar(cx, cy, R, a);
        const [tarX, tarY] = polar(cx, cy, (d.target / max) * R, a);
        const [curX, curY] = polar(cx, cy, (d.current / max) * R, a);
        const [lx, ly] = polar(cx, cy, R + 26, a);
        return (
          <g key={d.id}>
            <line
              x1={cx}
              y1={cy}
              x2={tx}
              y2={ty}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            {d.gap > 0 && (
              <line
                x1={curX}
                y1={curY}
                x2={tarX}
                y2={tarY}
                stroke="var(--warn)"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.45"
              />
            )}
            <line
              x1={cx}
              y1={cy}
              x2={curX}
              y2={curY}
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx={tarX}
              cy={tarY}
              r="4.5"
              fill="var(--background)"
              stroke="var(--foreground)"
              strokeWidth="1.5"
            />
            <circle
              cx={curX}
              cy={curY}
              r="5"
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth="2"
            />
            <text
              x={lx}
              y={ly + labelDy(a)}
              textAnchor={labelAnchor(a)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                fill: "var(--foreground)",
              }}
            >
              {d.name}
            </text>
            <text
              x={lx}
              y={ly + labelDy(a) + 13}
              textAnchor={labelAnchor(a)}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            >
              {d.current.toFixed(1)} / {d.target.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Public CareerWheel ────────────────────────────────────────────────────────

export function CareerWheel({
  data,
  variant = "classic",
  size = 360,
}: {
  data: WheelDataPoint[];
  variant?: Variant;
  size?: number;
}) {
  if (variant === "petals") return <WheelPetals data={data} size={size} />;
  if (variant === "rings") return <WheelRings data={data} size={size} />;
  return <WheelClassic data={data} size={size} />;
}
