import { useCallback, useState } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/coss/tabs";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import {
  type PrFilesLoader,
  type PrIssueComment,
  type PrLiveState,
  type PrOverviewLoader,
  type PrReviewComment,
  type ReviewDraft,
  reviewDraftKey,
} from "./_shared";
import { PrComments } from "./Comments";
import { PrDescription } from "./Description";
import { PrDiffViewer } from "./DiffViewer";
import { PrReviewActions } from "./ReviewActions";
import { PrReviewSubmitPanel } from "./ReviewComposer";

export function PRDetail({
  signal,
  onReplyStart,
  onReplyRollback,
  onPrState,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
  onPrState?: (state: PrLiveState) => void;
}) {
  const repo = signal.payload?.repo as string | undefined;
  const number = signal.payload?.number as number | undefined;
  const aiSummary = signal.payload?.ai_summary as string | undefined;
  const filesChanged =
    (signal.payload?.files_changed as
      | Array<{ path: string; additions?: number; deletions?: number }>
      | undefined) ?? [];
  const recentComments =
    (signal.payload?.recent_comments as
      | Array<{ author: string; body: string; created_at?: string }>
      | undefined) ?? [];
  return (
    <div data-slot="pr-detail" className="space-y-4">
      {aiSummary && (
        <section
          aria-label="AI summary"
          className="flex items-start gap-3"
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "var(--src-ai-bg)",
            border: "1px solid var(--hairline-soft)",
          }}
        >
          <SourceGlyph source="ai" size={20} />
          <div className="flex-1">
            <header
              className="font-bold uppercase tracking-wider"
              style={{
                fontSize: 9,
                color: "var(--src-ai)",
                marginBottom: 4,
              }}
            >
              AI Summary
            </header>
            <p
              className="whitespace-pre-line"
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--body, var(--foreground))",
              }}
            >
              {aiSummary}
            </p>
          </div>
        </section>
      )}
      {filesChanged.length > 0 && (
        <section aria-label="Files changed">
          <header
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: 9,
              color: "var(--muted-foreground)",
              marginBottom: 8,
            }}
          >
            Files Changed
          </header>
          <ul className="flex flex-col">
            {filesChanged.map((f) => (
              <li
                key={f.path}
                className="flex items-center"
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--hairline-soft)",
                }}
              >
                <span
                  className="flex-1 truncate"
                  style={{
                    fontSize: 12,
                    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                    color: "var(--body, var(--foreground))",
                  }}
                >
                  {f.path}
                </span>
                <span
                  className="shrink-0"
                  style={{
                    fontSize: 12,
                    fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                  }}
                >
                  {typeof f.additions === "number" && (
                    <span style={{ color: "var(--good)" }}>+{f.additions}</span>
                  )}
                  {typeof f.additions === "number" &&
                    typeof f.deletions === "number" && (
                      <span
                        style={{ color: "var(--muted-soft)", margin: "0 4px" }}
                      >
                        ·
                      </span>
                    )}
                  {typeof f.deletions === "number" && (
                    <span style={{ color: "var(--destructive)" }}>
                      -{f.deletions}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {repo && typeof number === "number" && (
        <PrPullRequestPanel repo={repo} number={number} onPrState={onPrState} />
      )}
      {recentComments.length > 0 && (
        <section aria-label="Recent comments">
          <header
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: 9,
              color: "var(--muted-foreground)",
              marginBottom: 8,
            }}
          >
            Recent Comments
          </header>
          <ol className="flex flex-col" style={{ gap: 14 }}>
            {recentComments.map((c, i) => (
              <li
                key={`${c.author}-${c.created_at ?? i}`}
                className="grid items-start"
                style={{ gridTemplateColumns: "auto 1fr", gap: 12 }}
              >
                <div
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--surface-strong)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {c.author.slice(0, 1).toUpperCase()}
                </div>
                <div
                  style={{
                    background: "var(--surface-soft)",
                    borderRadius: 12,
                    padding: "10px 14px",
                  }}
                >
                  <div
                    className="flex items-baseline"
                    style={{ gap: 8, marginBottom: 4 }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      @{c.author}
                    </span>
                  </div>
                  <p
                    className="whitespace-pre-line"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "var(--body, var(--foreground))",
                    }}
                  >
                    {c.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {repo && typeof number === "number" && !signal.payload?.draft && (
        <PrReviewActions
          repo={repo}
          number={number}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
}

export function PrPullRequestPanel({
  repo,
  number,
  loadOverview,
  loadFiles,
  onPrState,
}: {
  repo: string;
  number: number;
  loadOverview?: PrOverviewLoader;
  loadFiles?: PrFilesLoader;
  onPrState?: (state: PrLiveState) => void;
}) {
  const [commentsByPath, setCommentsByPath] = useState<
    Record<string, PrReviewComment[]>
  >({});
  const [reviewComments, setReviewComments] = useState<PrReviewComment[]>([]);
  const [issueComments, setIssueComments] = useState<PrIssueComment[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const handleReviewComments = useCallback((comments: PrReviewComment[]) => {
    setReviewComments(comments);
    setOverviewLoading(false);
  }, []);
  const upsertDraft = useCallback((draft: ReviewDraft) => {
    setDrafts((prev) => ({ ...prev, [reviewDraftKey(draft)]: draft }));
  }, []);
  const removeDraft = useCallback((key: string) => {
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  const clearDrafts = useCallback(() => setDrafts({}), []);
  const draftCount = Object.keys(drafts).length;
  return (
    <Tabs defaultValue="description">
      <TabsList variant="underline" className="w-full">
        <TabsTab value="description">Description</TabsTab>
        <TabsTab value="comments">
          Comments
          {reviewComments.length + issueComments.length > 0 && (
            <span
              data-slot="comment-count"
              className="ml-1 inline-flex items-center justify-center rounded-full px-1.5"
              style={{
                fontSize: 10,
                minWidth: 18,
                height: 18,
                background: "var(--surface-strong)",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              {reviewComments.length + issueComments.length}
            </span>
          )}
        </TabsTab>
        <TabsTab value="diff">Diff</TabsTab>
      </TabsList>
      <TabsPanel value="description" className="pt-3" keepMounted>
        <PrDescription
          repo={repo}
          number={number}
          load={loadOverview}
          onComments={setCommentsByPath}
          onReviewComments={handleReviewComments}
          onIssueComments={setIssueComments}
          onPrState={onPrState}
        />
      </TabsPanel>
      <TabsPanel value="comments" className="pt-3">
        <PrComments
          loading={overviewLoading}
          reviewComments={reviewComments}
          issueComments={issueComments}
        />
      </TabsPanel>
      <TabsPanel value="diff" className="pt-3">
        <div className="flex flex-col" style={{ gap: 12 }}>
          {draftCount > 0 && (
            <PrReviewSubmitPanel
              repo={repo}
              number={number}
              drafts={drafts}
              onCleared={clearDrafts}
            />
          )}
          <PrDiffViewer
            repo={repo}
            number={number}
            load={loadFiles}
            commentsByPath={commentsByPath}
            drafts={drafts}
            onAddDraft={upsertDraft}
            onRemoveDraft={removeDraft}
          />
        </div>
      </TabsPanel>
    </Tabs>
  );
}
