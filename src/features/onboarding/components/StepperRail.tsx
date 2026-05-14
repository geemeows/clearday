import { CheckIcon } from "lucide-react";

const STEPS = [
  { name: "Welcome", desc: "Confirm deployment" },
  { name: "Integrations", desc: "GitHub, Calendar, Slack" },
  { name: "AI provider", desc: "Bring your own key" },
  { name: "Alerts", desc: "When Devy taps you" },
  { name: "Ready", desc: "Open your day" },
] as const;

export function StepperRail({ current }: { current: number }) {
  return (
    <aside style={{ position: "sticky", top: 28 }}>
      <h4
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.4px",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
          margin: "0 0 16px",
          paddingLeft: 4,
        }}
      >
        Setup
      </h4>
      <ol
        style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}
        aria-label="Onboarding steps"
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 13,
            top: 14,
            bottom: 14,
            width: 1,
            background: "var(--border)",
          }}
        />
        {STEPS.map((step, i) => {
          const state: "active" | "done" | "pending" =
            i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li
              key={step.name}
              data-state={state}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "8px 4px",
                borderRadius: "var(--radius-md)",
                position: "relative",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: `1px solid ${
                    state === "active"
                      ? "var(--primary)"
                      : state === "done"
                        ? "color-mix(in oklab, var(--good) 32%, transparent)"
                        : "var(--border)"
                  }`,
                  background:
                    state === "active"
                      ? "var(--primary)"
                      : state === "done"
                        ? "color-mix(in oklab, var(--good) 16%, var(--canvas))"
                        : "var(--canvas)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    state === "active"
                      ? "var(--primary-foreground)"
                      : state === "done"
                        ? "var(--good)"
                        : "var(--muted-foreground)",
                  zIndex: 1,
                  boxShadow:
                    state === "active"
                      ? "0 0 0 4px color-mix(in oklab, var(--primary) 15%, transparent)"
                      : undefined,
                }}
              >
                {state === "done" ? (
                  <CheckIcon size={12} strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  paddingTop: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: state !== "pending" ? 600 : 500,
                    color:
                      state !== "pending"
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {step.name}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--muted-soft)" }}>
                  {step.desc}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
