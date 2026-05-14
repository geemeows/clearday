import { CheckIcon, ZapIcon, ListChecksIcon } from "lucide-react";

const WIRED_UP = [
  "GitHub PRs (reviewer, author, assignee) — polls every 90 seconds",
  "Google Calendar primary — polls every 2 minutes",
  "Slack DMs, mentions, and threads you've replied in",
  "Morning briefing via Gemini — daily at 07:30",
  "Slack self-DM alerts · 10-min meeting heads-up",
];

const NEXT_UP = [
  "Press ⌘K on any page to jump anywhere or run a command.",
  'Click “Start focus” in the sidebar to write a Calendar block + Slack snooze in one go.',
  "Pin a channel to Slack mentions if you want @here to count there too.",
];

export function ReadyStep() {
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
        Step 5 of 5
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
        You're all set.
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
        First poll runs in about 30 seconds. Here's what Devy will do for you.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 16,
        }}
      >
        {/* What's wired up */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 20,
            background: "var(--card)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background:
                  "color-mix(in oklab, var(--primary) 12%, transparent)",
                color: "var(--primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ListChecksIcon size={14} />
            </span>
            What's wired up
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {WIRED_UP.map((item) => (
              <li
                key={item}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  color: "var(--body)",
                  lineHeight: 1.5,
                }}
              >
                <CheckIcon
                  size={14}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    color: "var(--good)",
                  }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Try next */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: 20,
            background: "var(--card)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background:
                  "color-mix(in oklab, var(--primary) 12%, transparent)",
                color: "var(--primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ZapIcon size={14} />
            </span>
            Try next
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {NEXT_UP.map((text, i) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-soft)",
                  border: "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--muted-foreground)",
                    width: 18,
                    flexShrink: 0,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--foreground)",
                    lineHeight: 1.45,
                  }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
