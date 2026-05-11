import { Skeleton } from "#/components/ui/skeleton";
import { Markdown, type PrIssueComment, type PrReviewComment } from "./_shared";

type PrCommentEntry =
  | { kind: "issue"; data: PrIssueComment }
  | { kind: "review"; data: PrReviewComment };

export function PrComments({
  loading,
  reviewComments,
  issueComments,
}: {
  loading: boolean;
  reviewComments: PrReviewComment[];
  issueComments: PrIssueComment[];
}) {
  if (loading) return <PrCommentsSkeleton />;
  const entries: PrCommentEntry[] = [
    ...issueComments.map((c) => ({ kind: "issue" as const, data: c })),
    ...reviewComments.map((c) => ({ kind: "review" as const, data: c })),
  ].sort((a, b) => {
    const aT = a.data.created_at ?? "";
    const bT = b.data.created_at ?? "";
    return aT.localeCompare(bT);
  });
  if (entries.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        No comments yet.
      </p>
    );
  }
  return (
    <section
      aria-label="PR comments"
      className="flex flex-col"
      style={{ gap: 12 }}
    >
      {entries.map((entry) => (
        <PrCommentCard key={`${entry.kind}-${entry.data.id}`} entry={entry} />
      ))}
    </section>
  );
}

function PrCommentCard({ entry }: { entry: PrCommentEntry }) {
  const c = entry.data;
  return (
    <article
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline-soft)",
      }}
    >
      <header className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
        {c.user_avatar_url ? (
          <img
            src={c.user_avatar_url}
            alt={c.user ? `@${c.user}` : "commenter"}
            width={20}
            height={20}
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
              width: 20,
              height: 20,
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
        {entry.kind === "review" && (
          <span
            data-slot="comment-kind"
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              padding: "2px 6px",
              borderRadius: 999,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            Review
          </span>
        )}
        {entry.kind === "review" && (entry.data as PrReviewComment).path && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
              color: "var(--muted-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {(entry.data as PrReviewComment).path}
            {typeof (entry.data as PrReviewComment).line === "number"
              ? `:${(entry.data as PrReviewComment).line}`
              : ""}
          </span>
        )}
        {c.created_at && (
          <span
            className="ml-auto"
            style={{ fontSize: 11, color: "var(--muted-foreground)" }}
          >
            {new Date(c.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </header>
      <div
        className="markdown-body"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--body, var(--foreground))",
        }}
      >
        <Markdown>{c.body}</Markdown>
      </div>
    </article>
  );
}

function PrCommentsSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading comments"
      className="flex flex-col"
      style={{ gap: 12 }}
    >
      {[
        { id: "cm-sk-a", lines: 2 },
        { id: "cm-sk-b", lines: 3 },
      ].map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-2"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: row.lines }).map((_, i) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton lines are positional
              key={i}
              className="h-3.5"
              style={{ width: `${60 + ((i * 13) % 30)}%` }}
            />
          ))}
        </div>
      ))}
    </output>
  );
}
