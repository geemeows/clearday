// Slack detail pane — shown when a slack signal is selected in Inbox.
// Uses a tiptap rich-text composer for replies; serializes to Slack mrkdwn
// before posting via /api/slack/reply.

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "#/components/ui/button";
import {
  SparklesIcon,
  SendIcon,
  BoldIcon,
  ItalicIcon,
  CodeIcon,
  ListIcon,
} from "lucide-react";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { serializeToSlack, type TiptapDoc } from "#/features/signals/details/slack/serialize";
import { apiFetch } from "#/lib/api-client";
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

// ── Tiptap toolbar ────────────────────────────────────────────────────────────

type EditorState = ReturnType<typeof useEditor>;

function ToolbarButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 4,
        border: "none",
        background: active ? "var(--secondary)" : "transparent",
        cursor: "pointer",
        color: "var(--foreground)",
        opacity: active ? 1 : 0.7,
      }}
    >
      {children}
    </button>
  );
}

function ComposerToolbar({ editor }: { editor: NonNullable<EditorState> }) {
  return (
    <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--border)" }}>
      <ToolbarButton
        active={editor.isActive("bold")}
        title="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon style={{ width: 13, height: 13 }} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        title="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon style={{ width: 13, height: 13 }} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("code")}
        title="Inline code"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon style={{ width: 13, height: 13 }} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("bulletList")}
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon style={{ width: 13, height: 13 }} />
      </ToolbarButton>
    </div>
  );
}

// ── SlackDetail ───────────────────────────────────────────────────────────────

type Props = { signal: InboxSignal };

export function SlackDetail({ signal: s }: Props) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Reply to thread…" }),
    ],
    editorProps: {
      attributes: {
        style: "outline: none; min-height: 70px; padding: 8px 10px; font-size: 13px; line-height: 1.55;",
      },
    },
  });

  const isEmpty = editor?.isEmpty ?? true;

  const heading =
    s.kind === "dm"
      ? "Direct message"
      : s.kind === "mention"
        ? "Mention"
        : "Thread reply";

  const handleSend = async () => {
    if (!editor || isEmpty) return;
    const doc = editor.getJSON() as TiptapDoc;
    const text = serializeToSlack(doc);
    if (!text.trim()) return;

    setSending(true);
    try {
      await apiFetch("/api/slack/reply", {
        method: "POST",
        body: {
          channel: s.channel ?? "",
          text,
          thread_ts: s.thread_ts ?? undefined,
          signal_id: s.signalId ?? s.id,
        },
      });
      setSent(true);
      editor.commands.clearContent();
    } catch {
      // keep composer open on error; user can retry
    } finally {
      setSending(false);
    }
  };

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
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.who}</span>
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
                  <div style={{ fontSize: 13, color: "var(--body, var(--foreground))", lineHeight: 1.55 }}>
                    {t.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rich-text reply composer */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 8,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          REPLY
        </div>
        <div
          style={{
            background: "var(--surface-soft)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--hairline-soft, var(--border))",
            overflow: "hidden",
          }}
        >
          {sent ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--good, #22c55e)" }}>
              Reply sent.
            </div>
          ) : (
            <>
              {editor && <ComposerToolbar editor={editor} />}
              <div
                style={{ cursor: "text" }}
                onClick={() => editor?.commands.focus()}
              >
                <EditorContent editor={editor} />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "6px 8px",
                  borderTop: "1px solid var(--hairline-soft, var(--border))",
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
                  onClick={() => editor?.commands.clearContent()}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isEmpty || sending}
                  onClick={handleSend}
                >
                  <SendIcon />
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
