// Slack detail pane — shown when a slack signal is selected in Inbox.

import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { SparklesIcon, SendIcon } from "lucide-react";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { InboxSignal } from "#/features/signals/components/InboxView";

function relAgo(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function ThreadAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/[-\s@]/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--secondary)",
        color: "var(--foreground)",
        fontSize: size * 0.42,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

type Props = { signal: InboxSignal };

export function SlackDetail({ signal: s }: Props) {
  const [replyText, setReplyText] = useState("");
  const [sent, setSent] = useState(false);

  const heading =
    s.kind === "dm"
      ? "Direct message"
      : s.kind === "mention"
        ? "Mention"
        : "Thread reply";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 32px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <SourceGlyph source="slack" size={18} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--muted-foreground, var(--muted))",
            }}
          >
            {s.title}
          </span>
        </div>

        <h1
          style={{
            margin: "0 0 16px",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--foreground)",
          }}
        >
          {heading}
        </h1>

        {/* Thread messages */}
        {s.thread && s.thread.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 24,
            }}
          >
            {s.thread.map((t, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static thread rows, index is stable
                key={i}
                style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}
              >
                <ThreadAvatar name={t.who} size={28} />
                <div
                  style={{
                    background: "var(--surface-soft)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 14px",
                    border: "1px solid var(--hairline-soft, var(--border))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {t.who}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--muted-foreground, var(--muted))",
                      }}
                    >
                      {relAgo(t.when)} ago
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--body, var(--foreground))",
                      lineHeight: 1.55,
                    }}
                  >
                    {t.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick reply composer */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 8,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          QUICK REPLY
        </div>
        <div
          style={{
            background: "var(--surface-soft)",
            borderRadius: "var(--radius-md)",
            padding: 8,
            border: "1px solid var(--hairline-soft, var(--border))",
          }}
        >
          {sent ? (
            <div
              style={{
                padding: "12px 4px",
                fontSize: 13,
                color: "var(--good, #22c55e)",
              }}
            >
              Reply sent.
            </div>
          ) : (
            <>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to thread…"
                style={{ minHeight: 70, border: "none", background: "transparent", resize: "none" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 4,
                  padding: "0 4px 4px",
                  alignItems: "center",
                }}
              >
                <Button variant="ghost" size="sm">
                  <SparklesIcon />
                  Draft with AI
                </Button>
                <span style={{ flex: 1 }} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyText("")}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={replyText.trim().length === 0}
                  onClick={() => setSent(true)}
                >
                  <SendIcon />
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
