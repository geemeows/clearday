import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

const GIT_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.93c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.16 1.18a10.97 10.97 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
  </svg>
);

const CAL_ICON = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="16" y1="2" x2="16" y2="6" />
  </svg>
);

const SLACK_ICON = (
  <svg
    width="20"
    height="20"
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

const INTEGRATIONS: {
  id: string;
  name: string;
  required: boolean;
  scope: ReactNode;
  icon: ReactNode;
  colorBg: string;
  color: string;
}[] = [
  {
    id: "github",
    name: "GitHub",
    required: true,
    scope: (
      <>
        PRs where you're a reviewer, author, or assignee. Scopes:{" "}
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            background: "var(--surface-strong)",
            padding: "1px 5px",
            borderRadius: 4,
            color: "var(--foreground)",
          }}
        >
          read:user
        </code>{" "}
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            background: "var(--surface-strong)",
            padding: "1px 5px",
            borderRadius: 4,
            color: "var(--foreground)",
          }}
        >
          repo
        </code>
      </>
    ),
    icon: GIT_ICON,
    colorBg: "var(--src-git-bg)",
    color: "var(--src-git)",
  },
  {
    id: "google",
    name: "Google Calendar",
    required: true,
    scope:
      "Primary calendar only · accepted events with a video link · 10-minute pre-meeting alert. Read-only.",
    icon: CAL_ICON,
    colorBg: "var(--src-cal-bg)",
    color: "var(--src-cal)",
  },
  {
    id: "slack",
    name: "Slack",
    required: false,
    scope: "DMs, mentions, and replies in threads you've participated in.",
    icon: SLACK_ICON,
    colorBg: "var(--src-slack-bg)",
    color: "var(--src-slack)",
  },
];

export function IntegrationsStep({
  connected,
  onConnect,
}: {
  connected: Set<string>;
  onConnect: (id: string) => void;
}) {
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
        Step 2 of 5
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
        Connect your sources.
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
        v1 reads from these three. Each opens a consent screen, then drops the
        refresh token into your Supabase. Read-only — Devy never writes back.
      </p>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--card)",
        }}
      >
        {INTEGRATIONS.map((int, i) => {
          const isConnected = connected.has(int.id);
          return (
            <div
              key={int.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "18px 20px",
                borderBottom:
                  i < INTEGRATIONS.length - 1
                    ? "1px solid var(--hairline-soft)"
                    : undefined,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-md)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  background: int.colorBg,
                  color: int.color,
                }}
              >
                {int.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    marginBottom: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {int.name}
                  {int.required && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        letterSpacing: "0.3px",
                        textTransform: "uppercase",
                        color: "var(--muted-foreground)",
                        padding: "2px 7px",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                      }}
                    >
                      required
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--muted-foreground)",
                    lineHeight: 1.45,
                  }}
                >
                  {int.scope}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  data-provider={int.id}
                  data-connected={isConnected ? "true" : "false"}
                  onClick={() => onConnect(int.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 36,
                    padding: "0 14px",
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${isConnected ? "color-mix(in oklab, var(--good) 28%, transparent)" : "var(--border)"}`,
                    background: isConnected
                      ? "color-mix(in oklab, var(--good) 12%, var(--card))"
                      : "var(--card)",
                    color: isConnected ? "var(--good)" : "var(--foreground)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {isConnected ? (
                    <>
                      <CheckIcon size={14} />
                      Connected
                    </>
                  ) : (
                    "Connect"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--muted-foreground)",
          marginTop: 14,
          lineHeight: 1.5,
        }}
      >
        Tickets (Jira / Linear) are not in v1 — they ride along with the issue
        tracker that lands first.
      </p>
    </>
  );
}
