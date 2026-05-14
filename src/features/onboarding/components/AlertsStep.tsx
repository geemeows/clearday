import { Switch } from "#/components/ui/switch";

const THRESHOLD_OPTS = [2, 5, 10, 15, 30] as const;
export type ThresholdMin = (typeof THRESHOLD_OPTS)[number];

const SLACK_SVG = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="13" y="2" width="3" height="8" rx="1.5" />
    <rect x="2" y="13" width="8" height="3" rx="1.5" />
    <rect x="14" y="14" width="8" height="3" rx="1.5" />
    <rect x="8" y="14" width="3" height="8" rx="1.5" />
  </svg>
);

const BELL_SVG = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const CLOCK_SVG = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export function AlertsStep({
  slackDm,
  onSlackDm,
  webPush,
  onWebPush,
  threshold,
  onThreshold,
}: {
  slackDm: boolean;
  onSlackDm: (v: boolean) => void;
  webPush: boolean;
  onWebPush: (v: boolean) => void;
  threshold: ThresholdMin;
  onThreshold: (v: ThresholdMin) => void;
}) {
  const alertRow = {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "18px 20px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    background: "var(--card)",
    marginBottom: 10,
  };

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
        Step 4 of 5
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
        Where should Devy tap you?
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
        When a meeting's about to start or someone needs you, Devy can ping you
        outside the app. Pick one or both — both run when enabled.
      </p>

      {/* Slack self-DM */}
      <div
        style={{
          ...alertRow,
          borderColor: slackDm
            ? "color-mix(in oklab, var(--primary) 30%, var(--border))"
            : "var(--border)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: "var(--src-slack-bg)",
            color: "var(--src-slack)",
          }}
        >
          {SLACK_SVG}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Slack self-DM
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.3px",
                padding: "2px 7px",
                background:
                  "color-mix(in oklab, var(--good) 12%, transparent)",
                color: "var(--good)",
                border:
                  "1px solid color-mix(in oklab, var(--good) 28%, transparent)",
                borderRadius: 4,
                textTransform: "uppercase",
              }}
            >
              recommended
            </span>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--muted-foreground)",
              lineHeight: 1.5,
            }}
          >
            Devy posts to your own Slackbot DM. Reuses the Slack you just
            connected — nothing extra to set up.
          </div>
        </div>
        <Switch
          checked={slackDm}
          onCheckedChange={onSlackDm}
          aria-label="Toggle Slack self-DM"
        />
      </div>

      {/* Web Push */}
      <div
        style={{
          ...alertRow,
          borderColor: webPush
            ? "color-mix(in oklab, var(--primary) 30%, var(--border))"
            : "var(--border)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: "var(--src-ai-bg)",
            color: "var(--src-ai)",
          }}
        >
          {BELL_SVG}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}
          >
            Web Push (PWA)
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--muted-foreground)",
              lineHeight: 1.5,
            }}
          >
            Install Devy as a PWA and receive OS-level notifications. Requires a
            subscription on this device.
          </div>
        </div>
        <Switch
          checked={webPush}
          onCheckedChange={onWebPush}
          aria-label="Toggle Web Push"
        />
      </div>

      {/* Pre-meeting threshold */}
      <div
        style={{
          ...alertRow,
          flexDirection: "column",
          alignItems: "stretch",
          gap: 0,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            {CLOCK_SVG}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>
              Pre-meeting alert
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--muted-foreground)",
                lineHeight: 1.5,
              }}
            >
              How early Devy nudges you before a calendar event with a video
              link.
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px dashed var(--hairline-soft)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontSize: 12, color: "var(--muted-foreground)", flexShrink: 0 }}
          >
            Nudge me
          </span>
          <div
            role="radiogroup"
            aria-label="Pre-meeting alert lead time"
            style={{
              display: "inline-flex",
              padding: 3,
              background: "var(--surface-strong)",
              border: "1px solid var(--hairline-soft)",
              borderRadius: 999,
              gap: 2,
            }}
          >
            {THRESHOLD_OPTS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-pressed={threshold === m}
                aria-checked={threshold === m}
                onClick={() => onThreshold(m)}
                style={{
                  appearance: "none",
                  background:
                    threshold === m ? "var(--canvas)" : "transparent",
                  border: 0,
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 500,
                  color:
                    threshold === m
                      ? "var(--foreground)"
                      : "var(--muted-foreground)",
                  padding: "6px 12px",
                  borderRadius: 999,
                  boxShadow:
                    threshold === m
                      ? "0 1px 2px color-mix(in oklab, var(--ink) 8%, transparent), 0 0 0 1px var(--hairline-strong)"
                      : undefined,
                  lineHeight: 1,
                }}
              >
                {m} min
              </button>
            ))}
          </div>
          <span
            style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: "auto" }}
          >
            <b style={{ color: "var(--foreground)", fontWeight: 500 }}>
              {threshold} min
            </b>{" "}
            before the meeting
          </span>
        </div>
      </div>
    </>
  );
}
