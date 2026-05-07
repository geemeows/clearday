import { useEffect, useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import {
  defaultPrOverviewLoader,
  groupCommentsByPath,
  Markdown,
  type PrIssueComment,
  type PrLiveState,
  type PrOverviewLoader,
  type PrReviewComment,
} from "./_shared";

export function PrDescription({
  repo,
  number,
  load = defaultPrOverviewLoader,
  onComments,
  onReviewComments,
  onIssueComments,
  onPrState,
}: {
  repo: string;
  number: number;
  load?: PrOverviewLoader;
  onComments?: (commentsByPath: Record<string, PrReviewComment[]>) => void;
  onReviewComments?: (comments: PrReviewComment[]) => void;
  onIssueComments?: (comments: PrIssueComment[]) => void;
  onPrState?: (state: PrLiveState) => void;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; body: string | null }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ repo, number })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ kind: "ok", body: out.body });
          onComments?.(groupCommentsByPath(out.review_comments));
          onReviewComments?.(out.review_comments);
          onIssueComments?.(out.issue_comments);
          onPrState?.({
            state: out.state,
            merged: out.merged,
            merged_at: out.merged_at,
          });
        } else {
          setState({ kind: "error", message: out.error });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load PR",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    repo,
    number,
    load,
    onComments,
    onReviewComments,
    onIssueComments,
    onPrState,
  ]);

  return (
    <section aria-label="PR description">
      {state.kind === "loading" && <PrDescriptionSkeleton />}
      {state.kind === "error" && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--destructive)" }}
        >
          Couldn't load description: {state.message}
        </p>
      )}
      {state.kind === "ok" && !state.body && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          No description provided.
        </p>
      )}
      {state.kind === "ok" && state.body && (
        <div
          className="markdown-body"
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--body, var(--foreground))",
          }}
        >
          <Markdown>{state.body}</Markdown>
        </div>
      )}
    </section>
  );
}

function PrDescriptionSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Loading description"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-9/12" />
      <Skeleton className="h-3.5 w-10/12" />
      <Skeleton className="h-3.5 w-7/12" />
    </output>
  );
}
