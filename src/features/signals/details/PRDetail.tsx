// PR detail pane — shown when a git signal is selected in Inbox.
// Lazily fetches PR description + comments via /api/pr/overview and
// PR files via /api/pr/files. Renders markdown safely. Supports
// click-and-drag line-range selection on the unified diff for inline comments.

import { useState, useEffect, useCallback } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
  CheckIcon,
  MessageSquareDashedIcon,
  SparklesIcon,
  ExternalLinkIcon,
  FileIcon,
  GitPullRequestIcon,
  ChevronDownIcon,
  XIcon,
} from "lucide-react";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { renderMarkdown } from "#/features/signals/details/github/markdown";
import {
  applyEvent,
  clearSelection,
  initialState,
  isLineSelected,
  type DiffSelectionState,
} from "#/features/signals/details/github/diff-selection";
import { apiFetch } from "#/lib/api-client";
import type { InboxSignal } from "#/features/signals/components/InboxView";
import type {
  FetchPrOverviewResult,
  PrIssueComment,
} from "#/features/integrations/providers/github/capabilities/fetch-pr-overview";
import type { PrFile } from "#/features/integrations/providers/github/capabilities/fetch-pr-files";

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

// ── MarkdownBlock ─────────────────────────────────────────────────────────────

function MarkdownBlock({ html }: { html: string }) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify in renderMarkdown
    <div
      className="prose prose-sm max-w-none"
      style={{ fontSize: 13, lineHeight: 1.6 }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── DiffViewer ────────────────────────────────────────────────────────────────

type DiffLine = {
  index: number;
  type: "context" | "add" | "remove" | "hunk";
  content: string;
  lineNoLeft: number | null;
  lineNoRight: number | null;
};

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let leftLine = 0;
  let rightLine = 0;
  let index = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) {
        leftLine = Number(m[1]) - 1;
        rightLine = Number(m[2]) - 1;
      }
      lines.push({ index: index++, type: "hunk", content: raw, lineNoLeft: null, lineNoRight: null });
    } else if (raw.startsWith("+")) {
      rightLine++;
      lines.push({ index: index++, type: "add", content: raw.slice(1), lineNoLeft: null, lineNoRight: rightLine });
    } else if (raw.startsWith("-")) {
      leftLine++;
      lines.push({ index: index++, type: "remove", content: raw.slice(1), lineNoLeft: leftLine, lineNoRight: null });
    } else {
      leftLine++;
      rightLine++;
      lines.push({ index: index++, type: "context", content: raw.startsWith(" ") ? raw.slice(1) : raw, lineNoLeft: leftLine, lineNoRight: rightLine });
    }
  }
  return lines;
}

type DiffViewerProps = {
  file: PrFile;
  onClose: () => void;
  onComment: (body: string, startLine: number, endLine: number) => Promise<void>;
};

function DiffViewer({ file, onClose, onComment }: DiffViewerProps) {
  const [selState, setSelState] = useState<DiffSelectionState>(initialState());
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  const lines = file.patch ? parsePatch(file.patch) : [];

  const handlePointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setSelState((s) =>
        applyEvent(s, { type: "down", line: { index: idx, side: "RIGHT" } }),
      );
    },
    [],
  );

  const handlePointerMove = useCallback(
    (idx: number) => {
      setSelState((s) =>
        s.dragging
          ? applyEvent(s, { type: "move", line: { index: idx, side: "RIGHT" } })
          : s,
      );
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    setSelState((s) => applyEvent(s, { type: "up" }));
  }, []);

  const handleSubmitComment = async () => {
    if (!selState.committed || commentText.trim().length === 0) return;
    setPosting(true);
    try {
      await onComment(
        commentText.trim(),
        selState.committed.startIndex,
        selState.committed.endIndex,
      );
      setCommentText("");
      setSelState(clearSelection(selState));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      {/* File header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          background: "var(--surface-soft)",
          borderBottom: "1px solid var(--border)",
          gap: 8,
        }}
      >
        <FileIcon style={{ width: 13, height: 13, color: "var(--muted-foreground, var(--muted))", opacity: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}>
          {file.filename}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
          <span style={{ color: "var(--good, #22c55e)" }}>+{file.additions}</span>
          {" · "}
          <span style={{ color: "var(--destructive, #ef4444)" }}>−{file.deletions}</span>
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} style={{ width: 24, height: 24 }}>
          <XIcon style={{ width: 12, height: 12 }} />
        </Button>
      </div>

      {/* Diff lines */}
      {lines.length === 0 ? (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--muted-foreground, var(--muted))" }}>
          {file.patch ? "No diff available" : "Binary file"}
        </div>
      ) : (
        <div
          role="region"
          aria-label="diff viewer"
          style={{ overflowX: "auto", maxHeight: 500, overflowY: "auto" }}
        >
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}>
            <tbody>
              {lines.map((line) => {
                if (line.type === "hunk") {
                  return (
                    <tr key={line.index} style={{ background: "var(--surface-soft)" }}>
                      <td colSpan={3} style={{ padding: "2px 12px", color: "var(--muted-foreground, var(--muted))" }}>
                        {line.content}
                      </td>
                    </tr>
                  );
                }
                const selected = isLineSelected(selState, line.index);
                const bg =
                  selected
                    ? "color-mix(in srgb, var(--primary) 20%, transparent)"
                    : line.type === "add"
                      ? "color-mix(in srgb, var(--good, #22c55e) 12%, transparent)"
                      : line.type === "remove"
                        ? "color-mix(in srgb, var(--destructive, #ef4444) 12%, transparent)"
                        : "transparent";
                return (
                  <tr
                    key={line.index}
                    style={{ background: bg, cursor: "pointer", userSelect: "none" }}
                    onPointerDown={(e) => handlePointerDown(line.index, e)}
                    onPointerMove={() => handlePointerMove(line.index)}
                    onPointerUp={handlePointerUp}
                  >
                    <td style={{ padding: "1px 8px", color: "var(--muted-foreground, var(--muted))", minWidth: 40, textAlign: "right", borderRight: "1px solid var(--border)" }}>
                      {line.lineNoLeft ?? ""}
                    </td>
                    <td style={{ padding: "1px 8px", color: "var(--muted-foreground, var(--muted))", minWidth: 40, textAlign: "right", borderRight: "1px solid var(--border)" }}>
                      {line.lineNoRight ?? ""}
                    </td>
                    <td style={{ padding: "1px 12px", whiteSpace: "pre", width: "100%" }}>
                      <span style={{ color: line.type === "add" ? "var(--good, #22c55e)" : line.type === "remove" ? "var(--destructive, #ef4444)" : undefined }}>
                        {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                      </span>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline comment composer — appears when lines are selected */}
      {selState.committed && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: 12,
            background: "var(--background)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted-foreground, var(--muted))", marginBottom: 6 }}>
            Comment on lines {selState.committed.startIndex + 1}–{selState.committed.endIndex + 1}
          </div>
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Leave a comment…"
            style={{ minHeight: 60, marginBottom: 8, resize: "none" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCommentText("");
                setSelState(clearSelection(selState));
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={commentText.trim().length === 0 || posting}
              onClick={handleSubmitComment}
            >
              {posting ? "Posting…" : "Post comment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PRDetail ──────────────────────────────────────────────────────────────────

type Props = { signal: InboxSignal };

type OverviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: FetchPrOverviewResult }
  | { status: "error"; message: string };

type FilesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; files: PrFile[] }
  | { status: "error"; message: string };

export function PRDetail({ signal: s }: Props) {
  const [actionState, setActionState] = useState<
    "idle" | "approved" | "changes_requested"
  >("idle");
  const [overview, setOverview] = useState<OverviewState>({ status: "idle" });
  const [filesState, setFilesState] = useState<FilesState>({ status: "idle" });
  const [openFile, setOpenFile] = useState<PrFile | null>(null);

  const ref = s.repo ? `${s.repo} ${s.num ?? ""}`.trim() : "";
  const openedAgo = relAgo(s.age);

  // Parse repo and PR number from signal
  const prRepo = s.repo ?? null;
  const prNumber = s.num ? Number(s.num.replace(/^#/, "")) : null;
  const canFetch = prRepo && prNumber && !Number.isNaN(prNumber);

  // Lazy-load overview on mount if we have repo + number
  useEffect(() => {
    if (!canFetch) return;
    setOverview({ status: "loading" });
    (apiFetch(`/api/pr/overview?repo=${encodeURIComponent(prRepo!)}&number=${prNumber}`) as Promise<FetchPrOverviewResult>)
      .then((result) => setOverview({ status: "loaded", data: result }))
      .catch((err) =>
        setOverview({ status: "error", message: err instanceof Error ? err.message : String(err) }),
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  // Lazy-load file list on mount if we have repo + number
  useEffect(() => {
    if (!canFetch) return;
    setFilesState({ status: "loading" });
    (apiFetch(`/api/pr/files?repo=${encodeURIComponent(prRepo!)}&number=${prNumber}`) as Promise<{ ok: true; files: PrFile[] } | { ok: false; error: string }>)
      .then((result) => {
        if (result.ok) {
          setFilesState({ status: "loaded", files: result.files });
        } else {
          setFilesState({ status: "error", message: result.error });
        }
      })
      .catch((err) =>
        setFilesState({ status: "error", message: err instanceof Error ? err.message : String(err) }),
      );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  const handlePostLineComment = async (
    body: string,
    _startLine: number,
    _endLine: number,
  ) => {
    if (!canFetch) return;
    await apiFetch("/api/pr/comment", {
      method: "POST",
      body: { repo: prRepo, number: prNumber, body },
    });
  };

  const overviewData =
    overview.status === "loaded" && overview.data.ok ? overview.data : null;
  const comments: PrIssueComment[] = overviewData?.issue_comments ?? [];

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
          {overviewData && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                color: overviewData.merged ? "var(--primary)" : overviewData.state === "open" ? "var(--good, #22c55e)" : "var(--muted-foreground, var(--muted))",
                background: "color-mix(in srgb, currentColor 12%, transparent)",
                border: "1px solid color-mix(in srgb, currentColor 30%, transparent)",
                padding: "3px 8px",
                borderRadius: 6,
              }}
            >
              <GitPullRequestIcon style={{ width: 12, height: 12, opacity: 1 }} />
              {overviewData.merged ? "Merged" : overviewData.state === "open" ? "Open" : "Closed"}
            </span>
          )}
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
          {(overviewData?.author ?? s.author) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <InlineAvatar name={overviewData?.author ?? s.author ?? ""} size={22} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                {overviewData?.author ?? s.author}
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
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <span style={{ color: "var(--good, #22c55e)" }}>+{s.diff.add}</span>
              <span style={{ color: "var(--muted-foreground, var(--muted))", margin: "0 4px" }}>·</span>
              <span style={{ color: "var(--destructive, #ef4444)" }}>−{s.diff.del}</span>
              <span style={{ color: "var(--muted-foreground, var(--muted))" }}>{` across ${s.diff.files} files`}</span>
            </span>
          )}
        </div>

        {/* AI summary (from signal) */}
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4, color: "var(--src-ai, var(--primary))" }}>
                AI SUMMARY
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>{s.summary}</div>
            </div>
          </div>
        )}

        {/* PR description */}
        {overview.status === "loading" && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground, var(--muted))", marginBottom: 20 }}>Loading description…</div>
        )}
        {overviewData?.body && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8, color: "var(--muted-foreground, var(--muted))" }}>
              DESCRIPTION
            </div>
            <div style={{ background: "var(--surface-soft)", borderRadius: "var(--radius-md)", padding: "12px 14px", border: "1px solid var(--hairline-soft, var(--border))" }}>
              <MarkdownBlock html={renderMarkdown(overviewData.body)} />
            </div>
          </div>
        )}

        {/* Diff viewer (expanded file) */}
        {openFile && (
          <DiffViewer
            file={openFile}
            onClose={() => setOpenFile(null)}
            onComment={handlePostLineComment}
          />
        )}

        {/* Files changed */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8, color: "var(--muted-foreground, var(--muted))" }}>
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
          {filesState.status === "loading" && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-foreground, var(--muted))" }}>Loading files…</div>
          )}
          {filesState.status === "loaded" && filesState.files.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-foreground, var(--muted))" }}>No files changed.</div>
          )}
          {filesState.status === "loaded" &&
            filesState.files.map((f, i) => (
              <button
                key={f.filename}
                type="button"
                onClick={() => setOpenFile(openFile?.filename === f.filename ? null : f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderBottom: i < filesState.files.length - 1 ? "1px solid var(--hairline-soft, var(--border))" : "none",
                  gap: 8,
                  background: openFile?.filename === f.filename ? "var(--secondary)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <FileIcon style={{ width: 12, height: 12, color: "var(--muted-foreground, var(--muted))", opacity: 1 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, flex: 1 }}>{f.filename}</span>
                <ChevronDownIcon style={{ width: 12, height: 12, color: "var(--muted-foreground, var(--muted))", opacity: openFile?.filename === f.filename ? 1 : 0.5 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                  <span style={{ color: "var(--good, #22c55e)" }}>+{f.additions}</span>
                  <span style={{ color: "var(--muted-foreground, var(--muted))", margin: "0 4px" }}>·</span>
                  <span style={{ color: "var(--destructive, #ef4444)" }}>−{f.deletions}</span>
                </span>
              </button>
            ))}
          {/* Fallback from signal diff stats if files not yet loaded */}
          {filesState.status === "idle" && s.diff && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-foreground, var(--muted))" }}>
              {s.diff.files} file{s.diff.files !== 1 ? "s" : ""} changed
            </div>
          )}
        </div>

        {/* Comments */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 8, color: "var(--muted-foreground, var(--muted))" }}>
          RECENT COMMENTS
        </div>
        {overview.status === "loading" && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground, var(--muted))", marginBottom: 80 }}>Loading comments…</div>
        )}
        {comments.length === 0 && overview.status === "loaded" && (
          <div style={{ fontSize: 12, color: "var(--muted-foreground, var(--muted))", marginBottom: 80 }}>No comments yet.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 80 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
              <InlineAvatar name={c.user ?? "?"} size={28} />
              <div
                style={{
                  background: "var(--surface-soft)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  border: "1px solid var(--hairline-soft, var(--border))",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.user ?? "Unknown"}</span>
                  {c.created_at && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground, var(--muted))" }}>
                      {relAgo(c.created_at)} ago
                    </span>
                  )}
                </div>
                <MarkdownBlock html={renderMarkdown(c.body)} />
              </div>
            </div>
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
          {actionState === "changes_requested" ? "Changes requested" : "Request changes"}
        </Button>
        <Button variant="ghost" size="sm">
          <SparklesIcon />
          Draft reply with AI
        </Button>
        <span style={{ flex: 1 }} />
        {s.url && (
          <Button variant="ghost" size="sm" onClick={() => window.open(s.url ?? "", "_blank")}>
            Open in GitHub
            <ExternalLinkIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
