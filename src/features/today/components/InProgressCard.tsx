export type InProgressTicket = {
  id: string;
  title: string;
  p: string;
  days: number;
  pr: string | null;
};

type Props = {
  tickets: InProgressTicket[];
};

export function InProgressCard({ tickets }: Props) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--hairline-soft)",
        background: "var(--surface-card)",
        padding: "20px 22px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <span
          style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}
        >
          In progress
        </span>
        <span
          style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}
        >
          {tickets.length} tickets
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {tickets.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderBottom: "1px solid var(--hairline-soft)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                background: "var(--surface-strong)",
                color: "var(--body, var(--muted))",
                padding: "3px 8px",
                borderRadius: 6,
                whiteSpace: "nowrap",
              }}
            >
              {t.id}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 2,
                }}
              >
                {t.p} · {t.days}d in progress{t.pr ? ` · PR ${t.pr}` : ""}
              </div>
            </div>
            {/* Status dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--good, #22c55e)",
                flexShrink: 0,
              }}
              aria-label="In progress"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
