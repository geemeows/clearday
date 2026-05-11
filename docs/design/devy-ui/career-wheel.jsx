// Devy — Career wheel (radar + 2 alternate visual treatments)
// Variations exposed as Tweak: classic | petals | rings

const { useMemo: useWheelMemo } = React;

// Polar utility — 12 o'clock = -90°, clockwise.
function polar(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function polygonPoints(cx, cy, radii, angles) {
  return radii.map((r, i) => polar(cx, cy, r, angles[i]).join(",")).join(" ");
}

// ---------- Variation A: Classic radar ----------
function WheelClassic({ data, max = 4, size = 360 }) {
  const cx = size / 2, cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const angles = data.map((_, i) => (360 / n) * i);

  // axes + concentric grid
  const rings = [1, 2, 3, 4];

  // target & current polygons
  const targetRadii = data.map(d => (d.target / max) * R);
  const currentRadii = data.map(d => (d.current / max) * R);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: "block" }} aria-label="Career wheel">
      {/* concentric rings */}
      {rings.map(r => (
        <circle key={r} cx={cx} cy={cy} r={(r / max) * R}
          fill="none" stroke="var(--hairline-soft)" strokeWidth="1" />
      ))}
      {/* axes */}
      {angles.map((a, i) => {
        const [x, y] = polar(cx, cy, R, a);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y}
          stroke="var(--hairline-soft)" strokeWidth="1" />;
      })}
      {/* target polygon — dashed outline */}
      <polygon points={polygonPoints(cx, cy, targetRadii, angles)}
        fill="none" stroke="var(--muted-foreground)" strokeWidth="1.25"
        strokeDasharray="4 3" opacity="0.7" />
      {/* current polygon — filled */}
      <polygon points={polygonPoints(cx, cy, currentRadii, angles)}
        fill="var(--primary)" fillOpacity="0.18"
        stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
      {/* current points */}
      {data.map((d, i) => {
        const [x, y] = polar(cx, cy, currentRadii[i], angles[i]);
        return <circle key={d.id} cx={x} cy={y} r="3.5"
          fill="var(--primary)" stroke="var(--background)" strokeWidth="1.5" />;
      })}
      {/* labels */}
      {data.map((d, i) => {
        const [lx, ly] = polar(cx, cy, R + 26, angles[i]);
        const a = angles[i];
        const anchor = (a > 5 && a < 175) ? "start" : (a > 185 && a < 355) ? "end" : "middle";
        const dy = (a > 95 && a < 265) ? 12 : (a < 5 || a > 355 || (a > 175 && a < 185)) ? 4 : 0;
        return (
          <g key={d.id}>
            <text x={lx} y={ly + dy} textAnchor={anchor}
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--foreground)" }}>
              {d.name}
            </text>
            <text x={lx} y={ly + dy + 13} textAnchor={anchor}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
              {d.current.toFixed(1)} <tspan fill="var(--muted-foreground)">/ {d.target.toFixed(1)}</tspan>
            </text>
          </g>
        );
      })}
      {/* center value badges 1..4 along the top axis */}
      {rings.map(r => (
        <text key={r} x={cx + 3} y={cy - (r / max) * R + 3}
          style={{ fontSize: 9, fill: "var(--muted-soft)", fontWeight: 500 }}>{r}</text>
      ))}
    </svg>
  );
}

// ---------- Variation B: Petals ----------
// Each competency a curved petal: width fixed, length = current; target = chip at petal tip.
function WheelPetals({ data, max = 4, size = 360 }) {
  const cx = size / 2, cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const slice = 360 / n;
  const petalArc = slice * 0.62; // gap between petals

  const arcPath = (angleDeg, radius) => {
    const half = petalArc / 2;
    const [x1, y1] = polar(cx, cy, radius, angleDeg - half);
    const [x2, y2] = polar(cx, cy, radius, angleDeg + half);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: "block" }}>
      {/* outer faint ring (max) */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--hairline-soft)" strokeWidth="1" />
      {[1,2,3,4].map(r => (
        <circle key={r} cx={cx} cy={cy} r={(r/max)*R}
          fill="none" stroke="var(--hairline-soft)" strokeWidth="0.75" strokeDasharray="2 3" opacity="0.6" />
      ))}
      {data.map((d, i) => {
        const angle = slice * i;
        // current petal
        const curR = Math.max(8, (d.current / max) * R);
        const tarR = (d.target / max) * R;
        const [tx, ty] = polar(cx, cy, tarR, angle);
        return (
          <g key={d.id}>
            <path d={arcPath(angle, curR)}
              fill="var(--primary)" fillOpacity={0.22 + (d.current/max)*0.45}
              stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" />
            {/* target tick */}
            <line
              x1={polar(cx, cy, tarR, angle - petalArc/2)[0]}
              y1={polar(cx, cy, tarR, angle - petalArc/2)[1]}
              x2={polar(cx, cy, tarR, angle + petalArc/2)[0]}
              y2={polar(cx, cy, tarR, angle + petalArc/2)[1]}
              stroke="var(--foreground)" strokeWidth="1.25" strokeDasharray="2 2" opacity="0.65" />
            {/* label */}
            {(() => {
              const [lx, ly] = polar(cx, cy, R + 26, angle);
              const anchor = (angle > 5 && angle < 175) ? "start" : (angle > 185 && angle < 355) ? "end" : "middle";
              const dy = (angle > 95 && angle < 265) ? 12 : (angle < 5 || angle > 355 || (angle > 175 && angle < 185)) ? 4 : 0;
              return (
                <g>
                  <text x={lx} y={ly + dy} textAnchor={anchor}
                    style={{ fontSize: 11, fontWeight: 600, fill: "var(--foreground)" }}>{d.name}</text>
                  <text x={lx} y={ly + dy + 13} textAnchor={anchor}
                    style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
                    {d.current.toFixed(1)} / {d.target.toFixed(1)}
                  </text>
                </g>
              );
            })()}
          </g>
        );
      })}
      {/* center disc */}
      <circle cx={cx} cy={cy} r="6" fill="var(--background)" stroke="var(--border)" strokeWidth="1" />
    </svg>
  );
}

// ---------- Variation C: Concentric rings ----------
// Levels 0–4 as rings; each competency is an angle, with a track from 0 → target and a dot at current.
function WheelRings({ data, max = 4, size = 360 }) {
  const cx = size / 2, cy = size / 2;
  const padding = 56;
  const R = (size - padding * 2) / 2;
  const n = data.length;
  const angles = data.map((_, i) => (360 / n) * i);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: "block" }}>
      {/* level rings 1..4 with subtle labels */}
      {[1,2,3,4].map(r => (
        <g key={r}>
          <circle cx={cx} cy={cy} r={(r/max)*R}
            fill="none" stroke="var(--hairline-soft)" strokeWidth="1" />
          <text x={cx + 3} y={cy - (r/max)*R + 3}
            style={{ fontSize: 9, fill: "var(--muted-soft)", fontWeight: 500 }}>{r}</text>
        </g>
      ))}
      {/* per-competency vertical track + target marker + current dot */}
      {data.map((d, i) => {
        const a = angles[i];
        const [tx, ty] = polar(cx, cy, R, a);
        const [tarX, tarY] = polar(cx, cy, (d.target/max)*R, a);
        const [curX, curY] = polar(cx, cy, (d.current/max)*R, a);
        const anchor = (a > 5 && a < 175) ? "start" : (a > 185 && a < 355) ? "end" : "middle";
        const dy = (a > 95 && a < 265) ? 12 : (a < 5 || a > 355 || (a > 175 && a < 185)) ? 4 : 0;
        const [lx, ly] = polar(cx, cy, R + 26, a);
        return (
          <g key={d.id}>
            {/* axis */}
            <line x1={cx} y1={cy} x2={tx} y2={ty}
              stroke="var(--hairline)" strokeWidth="1" />
            {/* gap segment from current → target if behind */}
            {d.gap > 0 && (
              <line x1={curX} y1={curY} x2={tarX} y2={tarY}
                stroke="var(--warn)" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
            )}
            {/* solid segment from center → current */}
            <line x1={cx} y1={cy} x2={curX} y2={curY}
              stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
            {/* target ring marker */}
            <circle cx={tarX} cy={tarY} r="4.5"
              fill="var(--background)" stroke="var(--foreground)" strokeWidth="1.5" />
            {/* current dot */}
            <circle cx={curX} cy={curY} r="5"
              fill="var(--primary)" stroke="var(--background)" strokeWidth="2" />
            <text x={lx} y={ly + dy} textAnchor={anchor}
              style={{ fontSize: 11, fontWeight: 600, fill: "var(--foreground)" }}>{d.name}</text>
            <text x={lx} y={ly + dy + 13} textAnchor={anchor}
              style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
              {d.current.toFixed(1)} / {d.target.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CareerWheel({ data, variant = "classic", size = 360 }) {
  if (variant === "petals") return <WheelPetals data={data} size={size} />;
  if (variant === "rings")  return <WheelRings data={data} size={size} />;
  return <WheelClassic data={data} size={size} />;
}

window.CareerWheel = CareerWheel;
