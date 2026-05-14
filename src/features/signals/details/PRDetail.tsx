// PR detail pane — shown when a git signal is selected in Inbox.

import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
  CheckIcon,
  MessageSquareDashedIcon,
  SparklesIcon,
  ExternalLinkIcon,
  FileIcon,
  GitPullRequestIcon,
} from "lucide-react";
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

function InlineAvatar({ name, size = 24 }: { name: string; size?: number }) {
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

function CommentRow({
  who,
  ago,
  text,
}: {
  who: string;
  ago: string;
  text: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 12,
      }}
    >
      <InlineAvatar name={who} size={28} />
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
          <span style={{ fontSize: 13, fontWeight: 600 }}>{who}</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted-foreground, var(--muted))",
            }}
          >
            {ago} ago
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--body, var(--foreground))",
            lineHeight: 1.55,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

const FIXTURE_COMMENTS = [
  {
    who: "priya-w",
    when: new Date(Date.now() - 20 * 60_000).toISOString(),
    text: "Putting this up early — figured we should land the dedup before the Slack adapter ships, otherwise we'll generate dupes on every retry. Tests cover the (provider, kind, source_id) collision path.",
  },
  {
    who: "rahulm",
    when: new Date(Date.now() - 14 * 60_000).toISOString(),
    text: "LGTM on the upsert path. One Q on the retry budget — should we cap at 3 or let cron-orchestrator handle it?",
  },
];

const FIXTURE_FILES = [
  { f: "src/slack/webhook.ts", a: 84, d: 12 },
  { f: "src/signals/store.ts", a: 31, d: 14 },
  { f: "src/signals/upsert.test.ts", a: 56, d: 0 },
  { f: "src/cron/dispatch.ts", a: 8, d: 21 },
];

type Props = { signal: InboxSignal };

export function PRDetail({ signal: s }: Props) {
  const [actionState, setActionState] = useState<
    "idle" | "approved" | "changes_requested"
  >("idle");

  const ref = s.repo ? `${s.repo} ${s.num ?? ""}`.trim() : "";
  const openedAgo = relAgo(s.age);

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
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <SourceGlyph source="git" size={18} />
          {ref && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--muted-foreground, var(--muted))",
              }}
            >
              {ref}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--good, #22c55e)",
              background: "color-mix(in srgb, var(--good, #22c55e) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--good, #22c55e) 30%, transparent)",
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            <GitPullRequestIcon
              style={{ width: 12, height: 12, opacity: 1 }}
            />
            Open · review requested
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 20,
            fontWeight: 600,
            color: "var(--foreground)",
            lineHeight: 1.3,
          }}
        >
          {s.title}
        </h1>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {s.author && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <InlineAvatar name={s.author} size={22} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {s.author}
              </span>
            </div>
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--muted-foreground, var(--muted))",
            }}
          >
            opened {openedAgo} ago
          </span>
          {s.diff && (
            <span
              style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
            >
              <span style={{ color: "var(--good, #22c55e)" }}>
                +{s.diff.add}
              </span>
              <span
                style={{
                  color: "var(--muted-foreground, var(--muted))",
                  margin: "0 4px",
                }}
              >
                ·
              </span>
              <span style={{ color: "var(--destructive, #ef4444)" }}>
                −{s.diff.del}
              </span>
              <span
                style={{
                  color: "var(--muted-foreground, var(--muted))",
                }}
              >{` across ${s.diff.files} files`}</span>
            </span>
          )}
        </div>

        {/* AI summary */}
        {s.summary && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-lg)",
              marginBottom: 20,
              background: "var(--surface-soft)",
              border: "1px solid var(--border)",
              display: "flex",
              gap: 12,
              alignItems: "start",
            }}
          >
            <SourceGlyph source="ai" size={18} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  marginBottom: 4,
                  color: "var(--src-ai, var(--primary))",
                }}
              >
                AI SUMMARY
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--body, var(--foreground))",
                }}
              >
                {s.summary}
              </div>
            </div>
          </div>
        )}

        {/* Files changed */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 8,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          FILES CHANGED
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: 24,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          {FIXTURE_FILES.map((f, i) => (
            <div
              key={f.f}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                borderBottom:
                  i < FIXTURE_FILES.length - 1
                    ? "1px solid var(--hairline-soft, var(--border))"
                    : "none",
                gap: 8,
              }}
            >
              <FileIcon
                style={{
                  width: 12,
                  height: 12,
                  color: "var(--muted-foreground, var(--muted))",
                  opacity: 1,
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--body, var(--foreground))",
                  flex: 1,
                }}
              >
                {f.f}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}
              >
                <span style={{ color: "var(--good, #22c55e)" }}>
                  +{f.a}
                </span>
                <span
                  style={{
                    color: "var(--muted-foreground, var(--muted))",
                    margin: "0 4px",
                  }}
                >
                  ·
                </span>
                <span style={{ color: "var(--destructive, #ef4444)" }}>
                  −{f.d}
                </span>
              </span>
            </div>
          ))}
        </div>

        {/* Comments */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 8,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          RECENT COMMENTS
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            marginBottom: 80,
          }}
        >
          {FIXTURE_COMMENTS.map((c) => (
            <CommentRow
              key={c.who + c.when}
              who={c.who}
              ago={relAgo(c.when)}
              text={c.text}
            />
          ))}
        </div>
      </div>

      {/* Sticky action footer */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--background)",
          padding: "14px 32px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Button
          variant={actionState === "approved" ? "secondary" : "default"}
          size="sm"
          onClick={() => setActionState("approved")}
          disabled={actionState === "approved"}
        >
          <CheckIcon />
          {actionState === "approved" ? "Approved" : "Approve"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActionState("changes_requested")}
          disabled={actionState === "changes_requested"}
        >
          <MessageSquareDashedIcon />
          {actionState === "changes_requested"
            ? "Changes requested"
            : "Request changes"}
        </Button>
        <Button variant="ghost" size="sm">
          <SparklesIcon />
          Draft reply with AI
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm">
          Open in GitHub
          <ExternalLinkIcon />
        </Button>
      </div>
    </div>
  );
}
