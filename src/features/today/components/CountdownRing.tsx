type Props = {
  minutes: number;
  mm: string;
  ss: string;
  label?: string;
};

export function CountdownRing({
  minutes,
  mm,
  ss,
  label = "UNTIL STANDUP",
}: Props) {
  const total = Math.min(15, minutes + 1);
  const frac = total / 15;
  const C = 2 * Math.PI * 60;
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      <svg
        width="160"
        height="160"
        viewBox="0 0 160 160"
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx="80"
          cy="80"
          r="60"
          fill="none"
          stroke="var(--hairline-soft)"
          strokeWidth="3"
        />
        <circle
          cx="80"
          cy="80"
          r="60"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${frac * C} ${C}`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: -2,
            color: "var(--ink)",
          }}
        >
          {mm}
          <span style={{ color: "var(--muted-soft)" }}>:</span>
          {ss}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 0.6,
            fontWeight: 600,
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
