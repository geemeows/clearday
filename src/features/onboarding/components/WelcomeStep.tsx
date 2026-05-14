import { InfoIcon } from "lucide-react";

export function WelcomeStep({ userEmail }: { userEmail: string }) {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.4px",
          textTransform: "uppercase",
          color: "var(--primary)",
          marginBottom: 8,
        }}
      >
        Step 1 of 5
      </div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.8px",
          margin: "0 0 10px",
        }}
      >
        Welcome to your Devy.
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "var(--muted-foreground)",
          lineHeight: 1.55,
          margin: "0 0 32px",
          maxWidth: 580,
        }}
      >
        Your backend is up and you're signed in. Let's make sure the deployment
        looks right, then connect the tools that feed your inbox.
      </p>

      <div
        data-testid="deployment-summary"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        {(
          [
            { label: "Signed in", value: userEmail, mono: true, health: false },
            {
              label: "Worker",
              value: "devy.example.com",
              mono: false,
              health: true,
            },
            {
              label: "Supabase project",
              value: "supabase.co",
              mono: true,
              health: false,
            },
            {
              label: "Allowed email",
              value: userEmail,
              mono: true,
              health: false,
            },
          ] as const
        ).map(({ label, value, mono, health }, i) => (
          <div
            key={label}
            style={{
              padding: "18px 20px",
              borderRight:
                i % 2 === 0 ? "1px solid var(--hairline-soft)" : undefined,
              borderBottom:
                i < 2 ? "1px solid var(--hairline-soft)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.4px",
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
                marginBottom: 6,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontFamily: mono ? "var(--font-mono)" : undefined,
                fontSize: mono ? 13 : 14,
                color: "var(--foreground)",
                fontWeight: mono ? undefined : 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              {value}
              {health && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    background:
                      "color-mix(in oklab, var(--good) 14%, transparent)",
                    color: "var(--good)",
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                  healthy
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "14px 16px",
          borderRadius: "var(--radius-md)",
          background: "var(--brand-blue-tint)",
          border:
            "1px solid color-mix(in oklab, var(--primary) 18%, transparent)",
        }}
      >
        <InfoIcon
          size={18}
          style={{ color: "var(--primary)", flexShrink: 0, marginTop: 1 }}
        />
        <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
          <b style={{ color: "var(--foreground)" }}>
            Tokens stay on this Worker.
          </b>{" "}
          Every provider you connect next stores its refresh token in{" "}
          <i>your</i> Supabase. Clearday-the-project never sees them.
        </div>
      </div>
    </>
  );
}
