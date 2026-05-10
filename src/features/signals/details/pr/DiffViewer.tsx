import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/cn";
import {
  defaultPrFilesLoader,
  Markdown,
  type PrFile,
  type PrFilesLoader,
  type PrReviewComment,
  parsePatch,
  type ReviewDraft,
  type ReviewDraftSide,
  reviewDraftKey,
} from "./_shared";

export function PrDiffViewer({
  repo,
  number,
  load = defaultPrFilesLoader,
  commentsByPath,
  drafts,
  onAddDraft,
  onRemoveDraft,
}: {
  repo: string;
  number: number;
  load?: PrFilesLoader;
  commentsByPath?: Record<string, PrReviewComment[]>;
  drafts?: Record<string, ReviewDraft>;
  onAddDraft?: (draft: ReviewDraft) => void;
  onRemoveDraft?: (key: string) => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; files: PrFile[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ repo, number })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) setState({ kind: "ok", files: out.files });
        else setState({ kind: "error", message: out.error });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load diff",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, number, load]);

  return (
    <section aria-label="PR diff">
      {state.kind === "loading" && <PrDiffSkeleton />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--destructive)" }}
        >
          Couldn't load diff: {state.message}
        </p>
      )}
      {state.kind === "ok" && state.files.length === 0 && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          No files changed.
        </p>
      )}
      {state.kind === "ok" && state.files.length > 0 && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {state.files.map((f) => (
            <PrFilePatch
              key={f.filename}
              file={f}
              comments={commentsByPath?.[f.filename] ?? []}
              drafts={drafts}
              onAddDraft={onAddDraft}
              onRemoveDraft={onRemoveDraft}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PrDiffSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading diff"
      className="flex flex-col"
      style={{ gap: 8 }}
    >
      {[
        { id: "diff-sk-a", w: "62%" },
        { id: "diff-sk-b", w: "48%" },
        { id: "diff-sk-c", w: "74%" },
      ].map((row) => (
        <div
          key={row.id}
          className="flex items-center"
          style={{
            border: "1px solid var(--hairline-soft)",
            borderRadius: 12,
            padding: "8px 12px",
            gap: 12,
          }}
        >
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-3.5" style={{ width: row.w }} />
          <div className="flex-1" />
          <Skeleton className="h-3.5 w-10" />
        </div>
      ))}
    </output>
  );
}

function PrFilePatch({
  file,
  defaultOpen = false,
  comments = [],
  drafts,
  onAddDraft,
  onRemoveDraft,
}: {
  file: PrFile;
  defaultOpen?: boolean;
  comments?: PrReviewComment[];
  drafts?: Record<string, ReviewDraft>;
  onAddDraft?: (draft: ReviewDraft) => void;
  onRemoveDraft?: (key: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `pr-file-${file.filename.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <article
      data-slot="pr-file-patch"
      data-open={open || undefined}
      className="overflow-hidden"
      style={{
        border: "1px solid var(--hairline-soft)",
        borderRadius: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center text-left"
        style={{
          padding: "8px 12px",
          background: "var(--surface-soft)",
          borderBottom: open ? "1px solid var(--hairline-soft)" : "none",
          gap: 12,
        }}
      >
        <ChevronRight
          aria-hidden
          className="shrink-0 transition-transform"
          style={{
            width: 14,
            height: 14,
            color: "var(--muted-foreground)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
        <span
          className="flex-1 truncate"
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            color: "var(--ink)",
          }}
        >
          {file.filename}
        </span>
        {comments.length > 0 && (
          <span
            data-slot="comment-count"
            title={`${comments.length} review ${comments.length === 1 ? "comment" : "comments"}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full"
            style={{
              padding: "1px 8px",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--src-ai-bg)",
              color: "var(--src-ai)",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              role="presentation"
            >
              <title>review comments</title>
              <path d="M3 4h10v6H6l-3 3z" />
            </svg>
            {comments.length}
          </span>
        )}
        <span
          className="shrink-0"
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          }}
        >
          <span style={{ color: "var(--good)" }}>+{file.additions}</span>
          <span style={{ color: "var(--muted-soft)", margin: "0 4px" }}>·</span>
          <span style={{ color: "var(--destructive)" }}>-{file.deletions}</span>
        </span>
      </button>
      {open && (
        <div id={panelId}>
          {file.patch == null ? (
            <p
              className="m-0"
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            >
              Patch not available (binary or oversized file).
            </p>
          ) : (
            <PatchLines
              path={file.filename}
              patch={file.patch}
              comments={comments}
              drafts={drafts}
              onAddDraft={onAddDraft}
              onRemoveDraft={onRemoveDraft}
            />
          )}
        </div>
      )}
    </article>
  );
}

function PatchLines({
  path,
  patch,
  comments = [],
  drafts,
  onAddDraft,
  onRemoveDraft,
}: {
  path: string;
  patch: string;
  comments?: PrReviewComment[];
  drafts?: Record<string, ReviewDraft>;
  onAddDraft?: (draft: ReviewDraft) => void;
  onRemoveDraft?: (key: string) => void;
}) {
  const rows = useMemo(() => parsePatch(patch), [patch]);
  const commentsByLine = useMemo(() => {
    const out: Record<string, PrReviewComment[]> = {};
    for (const c of comments) {
      if (typeof c.line !== "number") continue;
      const side: ReviewDraftSide = c.side === "LEFT" ? "LEFT" : "RIGHT";
      const key = `${side}|${c.line}`;
      if (!out[key]) out[key] = [];
      out[key].push(c);
    }
    return out;
  }, [comments]);
  // Comments whose target line isn't part of the rendered patch (outdated /
  // truncated diffs). We surface these below the diff so reviewers don't
  // miss them.
  const orphanComments = useMemo(() => {
    const visibleKeys = new Set<string>();
    for (const row of rows) {
      if (typeof row.newLine === "number" && row.tone !== "del") {
        visibleKeys.add(`RIGHT|${row.newLine}`);
      }
      if (typeof row.oldLine === "number" && row.tone !== "add") {
        visibleKeys.add(`LEFT|${row.oldLine}`);
      }
    }
    return comments.filter((c) => {
      if (typeof c.line !== "number") return false;
      const side: ReviewDraftSide = c.side === "LEFT" ? "LEFT" : "RIGHT";
      return !visibleKeys.has(`${side}|${c.line}`);
    });
  }, [comments, rows]);
  const [composerAt, setComposerAt] = useState<{
    side: ReviewDraftSide;
    line: number;
    startLine?: number;
  } | null>(null);
  // Drag-to-select state. While the user holds the pointer down on a "+"
  // button and moves over other rows, we extend the range. On pointerup we
  // open the composer for the final span. A single click without movement
  // falls through to the click handler below for single-line behavior.
  const [drag, setDrag] = useState<{
    side: ReviewDraftSide;
    startLine: number;
    endLine: number;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  useEffect(() => {
    if (!drag) return;
    const onUp = () => {
      setDrag((cur) => {
        if (!cur) return null;
        const lo = Math.min(cur.startLine, cur.endLine);
        const hi = Math.max(cur.startLine, cur.endLine);
        if (lo !== hi) {
          setComposerAt({
            side: cur.side,
            line: hi,
            startLine: lo,
          });
          suppressNextClickRef.current = true;
        }
        return null;
      });
    };
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, [drag]);
  const startDraft = useCallback(
    (side: ReviewDraftSide, line: number, withShift: boolean) => {
      setComposerAt((prev) => {
        // Shift-click extends an existing composer on the same side into a
        // multi-line range. Without an open composer, shift-click behaves
        // like a regular click.
        if (withShift && prev && prev.side === side) {
          const anchor = prev.startLine ?? prev.line;
          const lo = Math.min(anchor, line);
          const hi = Math.max(anchor, line);
          return {
            side,
            line: hi,
            startLine: lo === hi ? undefined : lo,
          };
        }
        return { side, line };
      });
    },
    [],
  );
  return (
    <div
      className="overflow-x-auto"
      style={{
        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      {rows.map((row, i) => {
        const bg =
          row.tone === "add"
            ? "var(--good-soft)"
            : row.tone === "del"
              ? "var(--danger-soft)"
              : row.tone === "hunk"
                ? "var(--src-cal-bg)"
                : "transparent";
        const fg =
          row.tone === "add"
            ? "var(--good)"
            : row.tone === "del"
              ? "var(--destructive)"
              : row.tone === "hunk"
                ? "var(--src-cal)"
                : "var(--body, var(--foreground))";
        const side: ReviewDraftSide | null =
          row.tone === "del"
            ? "LEFT"
            : row.tone === "add" || row.tone === "ctx"
              ? "RIGHT"
              : null;
        const targetLine =
          side === "LEFT" ? row.oldLine : side === "RIGHT" ? row.newLine : null;
        const lineKey =
          side && typeof targetLine === "number"
            ? `${side}|${targetLine}`
            : null;
        const rowComments =
          lineKey && commentsByLine[lineKey] ? commentsByLine[lineKey] : [];
        const draft =
          side && typeof targetLine === "number" && drafts
            ? Object.values(drafts).find(
                (d) =>
                  d.path === path && d.side === side && d.line === targetLine,
              )
            : undefined;
        const composerOpen =
          composerAt &&
          side === composerAt.side &&
          targetLine === composerAt.line;
        const canComment = side !== null && typeof targetLine === "number";
        const inDragRange =
          drag &&
          side === drag.side &&
          typeof targetLine === "number" &&
          targetLine >= Math.min(drag.startLine, drag.endLine) &&
          targetLine <= Math.max(drag.startLine, drag.endLine);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: patch rows are positional and may repeat verbatim
            key={`r-${i}`}
            data-line-key={lineKey ?? undefined}
            onPointerEnter={() => {
              if (!drag) return;
              if (!side || drag.side !== side) return;
              if (typeof targetLine !== "number") return;
              setDrag((cur) =>
                cur && cur.endLine === targetLine
                  ? cur
                  : cur
                    ? { ...cur, endLine: targetLine }
                    : cur,
              );
            }}
          >
            <div
              className="group flex items-stretch"
              data-tone={row.tone}
              data-drag-selected={inDragRange ? "true" : undefined}
              style={{
                background: inDragRange
                  ? `color-mix(in oklab, var(--primary) 14%, ${bg})`
                  : bg,
                color: fg,
                boxShadow: inDragRange
                  ? "inset 3px 0 0 0 var(--primary)"
                  : undefined,
              }}
            >
              <span
                aria-hidden
                className="select-none text-right"
                style={{
                  flex: "0 0 38px",
                  padding: "0 6px",
                  color: "var(--muted-foreground)",
                  borderRight: "1px solid var(--hairline-soft)",
                }}
              >
                {typeof row.oldLine === "number" && row.tone !== "add"
                  ? row.oldLine
                  : ""}
              </span>
              <span
                aria-hidden
                className="select-none text-right"
                style={{
                  flex: "0 0 38px",
                  padding: "0 6px",
                  color: "var(--muted-foreground)",
                  borderRight: "1px solid var(--hairline-soft)",
                }}
              >
                {typeof row.newLine === "number" && row.tone !== "del"
                  ? row.newLine
                  : ""}
              </span>
              {canComment && onAddDraft ? (
                <button
                  type="button"
                  onPointerDown={() => {
                    if (!side || typeof targetLine !== "number") return;
                    setDrag({
                      side,
                      startLine: targetLine,
                      endLine: targetLine,
                    });
                  }}
                  onClick={(e) => {
                    if (suppressNextClickRef.current) {
                      suppressNextClickRef.current = false;
                      return;
                    }
                    if (!side || typeof targetLine !== "number") return;
                    startDraft(side, targetLine, e.shiftKey);
                  }}
                  aria-label={`Comment on ${side === "LEFT" ? "old" : "new"} line ${targetLine}`}
                  title="Click to comment, shift-click or click-and-drag to span a range"
                  data-slot="add-comment"
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center group-hover:opacity-100",
                    inDragRange ? "opacity-100" : "opacity-0",
                  )}
                  style={{
                    width: 18,
                    height: 16,
                    margin: "auto 2px",
                    fontSize: 12,
                    lineHeight: 1,
                    color: "var(--canvas)",
                    background: "var(--primary)",
                    borderRadius: 4,
                    border: 0,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              ) : (
                <span style={{ width: 22 }} aria-hidden />
              )}
              <span
                className="flex-1"
                style={{ padding: "0 8px", whiteSpace: "pre" }}
              >
                {row.raw || " "}
              </span>
            </div>
            {(rowComments.length > 0 || draft || composerOpen) &&
              side &&
              typeof targetLine === "number" && (
                <InlineThread
                  path={path}
                  side={side}
                  line={targetLine}
                  startLine={
                    composerOpen ? composerAt?.startLine : draft?.startLine
                  }
                  comments={rowComments}
                  draft={draft}
                  showComposer={!!composerOpen && !draft}
                  onCancelComposer={() => setComposerAt(null)}
                  onAddDraft={(d) => {
                    onAddDraft?.(d);
                    setComposerAt(null);
                  }}
                  onEditDraft={() =>
                    setComposerAt({
                      side,
                      line: targetLine,
                      startLine: draft?.startLine,
                    })
                  }
                  onRemoveDraft={(k) => onRemoveDraft?.(k)}
                />
              )}
          </div>
        );
      })}
      {orphanComments.length > 0 && (
        <section
          aria-label="Outdated review comments"
          data-slot="orphan-comments"
          className="flex flex-col"
          style={{
            gap: 8,
            padding: 12,
            borderTop: "1px solid var(--hairline-soft)",
            background: "var(--surface-soft)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: "var(--muted-foreground)",
            }}
          >
            Outdated
          </span>
          {orphanComments.map((c) => (
            <article
              key={c.id}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--canvas)",
                border: "1px solid var(--hairline-soft)",
              }}
            >
              <header
                className="flex items-center"
                style={{ gap: 8, marginBottom: 4 }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  @{c.user ?? "unknown"}
                </span>
                {typeof c.line === "number" && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    line {c.line}
                  </span>
                )}
              </header>
              <div
                className="markdown-body"
                style={{ fontSize: 13, lineHeight: 1.5 }}
              >
                <Markdown>{c.body}</Markdown>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function InlineThread({
  path,
  side,
  line,
  startLine,
  comments,
  draft,
  showComposer,
  onCancelComposer,
  onAddDraft,
  onEditDraft,
  onRemoveDraft,
}: {
  path: string;
  side: ReviewDraftSide;
  line: number;
  startLine?: number;
  comments: PrReviewComment[];
  draft?: ReviewDraft;
  showComposer: boolean;
  onCancelComposer: () => void;
  onAddDraft: (d: ReviewDraft) => void;
  onEditDraft: () => void;
  onRemoveDraft: (key: string) => void;
}) {
  const sideLabel = side === "LEFT" ? "old" : "new";
  const rangeLabel =
    typeof startLine === "number" && startLine !== line
      ? `${sideLabel} lines ${startLine}–${line}`
      : `${sideLabel} line ${line}`;
  return (
    <div
      data-slot="inline-thread"
      style={{
        background: "var(--surface-soft)",
        borderTop: "1px solid var(--hairline-soft)",
        borderBottom: "1px solid var(--hairline-soft)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {comments.map((c) => (
        <article
          key={c.id}
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--canvas)",
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <header
            className="flex items-center"
            style={{ gap: 8, marginBottom: 4 }}
          >
            {c.user_avatar_url ? (
              <img
                src={c.user_avatar_url}
                alt={c.user ? `@${c.user}` : "reviewer"}
                width={18}
                height={18}
                style={{
                  borderRadius: "50%",
                  border: "1px solid var(--hairline-soft)",
                  objectFit: "cover",
                }}
              />
            ) : (
              <span
                aria-hidden
                className="inline-flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--surface-strong)",
                  color: "var(--ink)",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {(c.user?.[0] ?? "?").toUpperCase()}
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              @{c.user ?? "unknown"}
            </span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                color: "var(--muted-foreground)",
              }}
            >
              line {c.line}
            </span>
          </header>
          <div
            className="markdown-body"
            style={{ fontSize: 13, lineHeight: 1.5 }}
          >
            <Markdown>{c.body}</Markdown>
          </div>
        </article>
      ))}
      {draft && !showComposer && (
        <article
          data-slot="draft-comment"
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--canvas)",
            border: "1px dashed var(--primary)",
          }}
        >
          <header
            className="flex items-center"
            style={{ gap: 8, marginBottom: 4 }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "var(--primary)",
              }}
            >
              Pending — {rangeLabel}
            </span>
            <button
              type="button"
              onClick={onEditDraft}
              className="ml-auto"
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() =>
                onRemoveDraft(
                  reviewDraftKey({
                    path,
                    line,
                    side,
                    startLine: draft.startLine,
                  }),
                )
              }
              style={{
                fontSize: 11,
                color: "var(--destructive)",
                background: "transparent",
                border: 0,
                cursor: "pointer",
              }}
            >
              Discard
            </button>
          </header>
          <p
            className="m-0 whitespace-pre-line"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--body, var(--foreground))",
            }}
          >
            {draft.body}
          </p>
        </article>
      )}
      {showComposer && (
        <InlineComposer
          path={path}
          side={side}
          line={line}
          startLine={startLine}
          rangeLabel={rangeLabel}
          initialBody={draft?.body ?? ""}
          onCancel={onCancelComposer}
          onSubmit={onAddDraft}
        />
      )}
    </div>
  );
}

function InlineComposer({
  path,
  side,
  line,
  startLine,
  rangeLabel,
  initialBody,
  onCancel,
  onSubmit,
}: {
  path: string;
  side: ReviewDraftSide;
  line: number;
  startLine?: number;
  rangeLabel: string;
  initialBody: string;
  onCancel: () => void;
  onSubmit: (d: ReviewDraft) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const trimmed = body.trim();
  return (
    <div
      data-slot="inline-composer"
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--canvas)",
        border: "1px solid var(--primary)",
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: 8, marginBottom: 6, fontSize: 11 }}
      >
        <span style={{ fontWeight: 600, color: "var(--primary)" }}>
          New comment
        </span>
        <span style={{ color: "var(--muted-foreground)" }}>{rangeLabel}</span>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment on this line"
        aria-label="Inline review comment"
        rows={3}
        style={{
          width: "100%",
          padding: 8,
          fontSize: 13,
          fontFamily: "inherit",
          borderRadius: 6,
          border: "1px solid var(--hairline-soft)",
          resize: "vertical",
          background: "var(--canvas)",
          color: "var(--foreground)",
        }}
      />
      <div
        className="flex items-center"
        style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            border: "1px solid var(--hairline-soft)",
            borderRadius: 6,
            background: "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={trimmed.length === 0}
          onClick={() =>
            onSubmit({
              path,
              side,
              line,
              startLine: startLine !== line ? startLine : undefined,
              body: trimmed,
            })
          }
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 6,
            border: 0,
            background:
              trimmed.length === 0 ? "var(--surface-strong)" : "var(--primary)",
            color:
              trimmed.length === 0
                ? "var(--muted-foreground)"
                : "var(--canvas)",
            cursor: trimmed.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          Add to review
        </button>
      </div>
    </div>
  );
}
