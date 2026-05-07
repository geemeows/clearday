import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { z } from "zod";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/coss/tabs";
import { Skeleton } from "#/components/ui/skeleton";
import { StatusBadge } from "#/components/ui/StatusBadge";
import { UserAvatar } from "#/components/ui/UserAvatar";
import {
  providerOpenLabel,
  providerSourceKind,
  signalKindLabel,
} from "#/features/integrations/display";
import {
  InboxRow,
  InboxView as BaseInboxView,
  type RenderDetailArgs,
  type StoredSignal,
} from "#/features/signals/components/InboxView";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { SignalDetail } from "#/features/signals/details";
import {
  AttendeeStack,
  type MeetingAttendee,
} from "#/features/signals/details/meeting/Attendees";
import { MeetingDetail } from "#/features/signals/details/meeting";
import { TaskDetail } from "#/features/signals/details/task";
import {
  type Filter,
  kindGroup,
  relAgo,
} from "#/features/signals/display";
import { filterMeetingsToToday } from "#/features/signals/views/today";
import { useAutoRefresh } from "#/hooks/use-auto-refresh";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import { supabase } from "#/lib/supabase";

export { InboxRow, AttendeeStack, MeetingDetail, TaskDetail };
export type { StoredSignal, MeetingAttendee };

// Wraps the feature-module InboxView with a default renderDetail that points
// at the route-local InboxDetailPane. Keeps existing test call sites working
// without forcing every caller to wire up a detail renderer.
export function InboxView(
  props: Omit<Parameters<typeof BaseInboxView>[0], "renderDetail"> & {
    renderDetail?: (args: RenderDetailArgs) => React.ReactNode;
  },
) {
  const { renderDetail, ...rest } = props;
  const fallback = (args: RenderDetailArgs) => (
    <InboxDetailPane
      signal={args.selected}
      onClose={args.onClose}
      onDismiss={props.onDismiss}
      onReplyStart={props.onReplyStart}
      onReplyRollback={props.onReplyRollback}
    />
  );
  return <BaseInboxView {...rest} renderDetail={renderDetail ?? fallback} />;
}

const inboxSearchSchema = z.object({
  signal: z.string().optional(),
});

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: inboxSearchSchema,
  component: InboxPage,
});

function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [signals, setSignals] = useState<StoredSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedId = search.signal ?? null;
  const setSelectedId = useCallback(
    (next: string | null) => {
      navigate({
        search: (prev) => ({ ...prev, signal: next ?? undefined }),
        replace: true,
      });
    },
    [navigate],
  );
  const [repliedIds, setRepliedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    try {
      const body = (await apiFetch("/api/signals?filter=all")) as {
        signals: StoredSignal[];
      };
      setSignals(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useAutoRefresh(reload);

  const dismiss = useCallback(
    async (id: string) => {
      setSignals((current) => current?.filter((s) => s.id !== id) ?? null);
      if (selectedId === id) setSelectedId(null);
      setRepliedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await apiFetch(`/api/signals/${id}/dismiss`, { method: "POST" });
      reload();
    },
    [reload, selectedId, setSelectedId],
  );

  const handleReplyStart = useCallback((id: string) => {
    setRepliedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleReplyRollback = useCallback((id: string) => {
    setRepliedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Inbox is "what's happening now/next" — clip meetings to today regardless
  // of the active filter; non-meeting signals are unaffected.
  const visibleSignals = signals ? filterMeetingsToToday(signals) : signals;

  return (
    <InboxView
      filter={filter}
      onFilterChange={setFilter}
      signals={visibleSignals}
      error={error}
      onDismiss={dismiss}
      selectedId={selectedId}
      onSelect={setSelectedId}
      repliedIds={repliedIds}
      onReplyStart={handleReplyStart}
      onReplyRollback={handleReplyRollback}
      renderDetail={({ selected, onClose }) => (
        <InboxDetailPane
          signal={selected}
          onClose={onClose}
          onDismiss={dismiss}
          onReplyStart={handleReplyStart}
          onReplyRollback={handleReplyRollback}
        />
      )}
    />
  );
}


export function InboxDetailPane({
  signal,
  onClose,
  onDismiss,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal | null;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const [liveState, setLiveState] = useState<PrLiveState | null>(null);
  const signalId = signal?.id;
  // Reset whenever a different signal is selected so the chip doesn't
  // briefly show the previous PR's merged state. Biome can't see that
  // signalId is the trigger (the body doesn't read it), but we need the
  // effect to refire on selection change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signalId is the reset trigger
  useEffect(() => {
    setLiveState(null);
  }, [signalId]);
  if (!signal) {
    return (
      <aside
        aria-label="Signal detail"
        className="hidden h-full items-center justify-center text-sm lg:flex"
        style={{ color: "var(--muted-foreground)" }}
      >
        Select a signal to see details.
      </aside>
    );
  }
  const group = kindGroup(signal.kind);
  const prRepo = signal.payload?.repo as string | undefined;
  const prNumber = signal.payload?.number as number | undefined;
  return (
    <aside
      aria-label="Signal detail"
      data-detail-kind={group}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: "28px 32px" }}
    >
      <header
        className="flex items-center"
        style={{ gap: 8, marginBottom: 12 }}
      >
        <SourceGlyph source={providerSourceKind(signal.provider)} size={20} />
        {group === "pr" && prRepo ? (
          <span
            className="font-medium"
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            }}
          >
            {prRepo}
            {typeof prNumber === "number" ? ` #${prNumber}` : ""}
          </span>
        ) : (
          <span
            className="font-medium uppercase tracking-wider"
            style={{
              fontSize: 11,
              color: "var(--muted-foreground)",
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            }}
          >
            {signalKindLabel(signal.kind)}
          </span>
        )}
        <span className="flex-1" />
        {group === "pr" && <PrStatusBadge signal={signal} liveState={liveState} />}
        <button
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="rounded-full p-1 hover:bg-(--surface-strong)"
          style={{ color: "var(--muted-foreground)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <h2
        className="font-semibold tracking-tight"
        style={{
          fontSize: 22,
          lineHeight: 1.18,
          letterSpacing: "-0.4px",
          color: "var(--ink)",
          margin: group === "pr" ? "0 0 14px" : "0 0 14px",
        }}
      >
        {signal.title}
      </h2>
      {group === "pr" && <PrMetaRow signal={signal} />}
      {group === "pr" && (
        <PRDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
          onPrState={setLiveState}
        />
      )}
      {group === "slack" && (
        <SlackDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
      <SignalDetail signal={signal} />
      <div
        className="flex flex-wrap items-center gap-2"
        style={{
          marginTop: 24,
          padding: "16px 0",
          background: "var(--canvas)",
          borderTop: "1px solid var(--hairline-soft)",
        }}
      >
        <button
          type="button"
          onClick={() => onDismiss(signal.id)}
          className="inline-flex items-center justify-center rounded-md hover:bg-(--surface-soft)"
          style={{
            height: 32,
            padding: "0 12px",
            fontSize: 13,
            color: "var(--muted-foreground)",
          }}
        >
          Dismiss
        </button>
        <span className="flex-1" />
        {/* MeetingDetail carries its own Join meeting / Open invite buttons. */}
        {signal.url && group !== "meeting" && (
          <a
            href={signal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md hover:bg-(--surface-soft)"
            style={{
              height: 32,
              padding: "0 12px",
              fontSize: 13,
              color: "var(--muted-foreground)",
            }}
          >
            {providerOpenLabel(signal.provider)} →
            {/* <ExternalLink className="h-3.5 w-3.5" aria-hidden /> */}
          </a>
        )}
      </div>
    </aside>
  );
}

function PrStatusBadge({
  signal,
  liveState,
}: {
  signal: StoredSignal;
  liveState: PrLiveState | null;
}) {
  const merged = liveState ? liveState.merged : Boolean(signal.payload?.merged);
  const closed = liveState
    ? liveState.state === "closed" && !liveState.merged
    : Boolean(signal.payload?.closed) && !merged;
  const draft = Boolean(signal.payload?.draft);
  const tone: "success" | "info" | "danger" | "muted" = merged
    ? "info"
    : closed
      ? "danger"
      : draft
        ? "muted"
        : "success";
  const label = merged
    ? "Merged"
    : closed
      ? "Closed"
      : draft
        ? "Draft"
        : signal.kind === "pr_review_requested"
          ? "Open · review requested"
          : signal.kind === "pr_authored"
            ? "Open · authored by you"
            : "Open";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

function PrMetaRow({ signal }: { signal: StoredSignal }) {
  const author = signal.payload?.author as string | undefined;
  const additions = signal.payload?.additions as number | undefined;
  const deletions = signal.payload?.deletions as number | undefined;
  const filesChanged =
    (signal.payload?.files_changed as Array<{ path: string }> | undefined) ??
    [];
  const filesCount =
    (signal.payload?.files_count as number | undefined) ?? filesChanged.length;
  const opened = signal.source_created_at
    ? relAgo(signal.source_created_at, new Date().toISOString())
    : "";
  return (
    <div
      data-slot="pr-meta"
      className="flex flex-wrap items-center"
      style={{ gap: 16, marginBottom: 20 }}
    >
      {author && (
        <span className="flex items-center" style={{ gap: 8 }}>
          <UserAvatar name={author} size="sm" />
          <span style={{ fontSize: 13, fontWeight: 500 }}>@{author}</span>
        </span>
      )}
      {opened && (
        <span
          style={{
            fontSize: 12,
            color: "var(--muted-foreground)",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          }}
        >
          opened {opened}
        </span>
      )}
      {(typeof additions === "number" || typeof deletions === "number") && (
        <span
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
          }}
        >
          {typeof additions === "number" && (
            <span style={{ color: "var(--good)" }}>+{additions}</span>
          )}
          {typeof additions === "number" && typeof deletions === "number" && (
            <span style={{ color: "var(--muted-soft)", margin: "0 4px" }}>
              ·
            </span>
          )}
          {typeof deletions === "number" && (
            <span style={{ color: "var(--destructive)" }}>−{deletions}</span>
          )}
          {filesCount > 0 && (
            <span style={{ color: "var(--muted-foreground)" }}>
              {` across ${filesCount} ${filesCount === 1 ? "file" : "files"}`}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

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

type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export type PrReviewSubmitDraft = {
  path: string;
  line: number;
  side: ReviewDraftSide;
  body: string;
  start_line?: number;
  start_side?: ReviewDraftSide;
};

type PrReviewSubmit = (params: {
  repo: string;
  number: number;
  event: PrReviewEvent;
  body?: string;
  signal_id?: string;
  comments?: PrReviewSubmitDraft[];
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

const defaultPrReviewSubmit: PrReviewSubmit = async (params) =>
  (await apiFetch("/api/pr/review", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

type DraftReplyResultUi =
  | { ok: true; draft: string }
  | { ok: false; reason: string; error?: string };

type DraftRequest = (params: {
  signal_id: string;
  instruction?: string;
}) => Promise<DraftReplyResultUi>;

const defaultDraftRequest: DraftRequest = async (params) =>
  (await apiFetch("/api/ai/draft", {
    method: "POST",
    body: params,
  })) as DraftReplyResultUi;

function draftRefusedMessage(reason: string): string {
  if (reason === "no_provider") return "No AI provider configured.";
  if (reason === "budget_reached")
    return "AI disabled — monthly budget reached.";
  if (reason === "disabled") return "AI is disabled for this account.";
  return "AI draft failed.";
}

type RequestConnectUrl = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

type OpenUrl = (url: string) => void;

const defaultRequestConnectUrl: RequestConnectUrl = async (provider) =>
  (await apiFetch(`/api/providers/${provider}/connect-url`)) as {
    ok: boolean;
    url?: string;
    error?: string;
  };

const defaultOpenUrl: OpenUrl = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

type PrFilesResult =
  | { ok: true; files: PrFile[] }
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

type PrFilesLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrFilesResult>;

const defaultPrFilesLoader: PrFilesLoader = async ({ repo, number }) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/files?${qs}`)) as PrFilesResult;
};

export type PrReviewComment = {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  diff_hunk: string | null;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrIssueComment = {
  id: number;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrLiveState = {
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
};

export type PrOverviewResult =
  | ({
      ok: true;
      body: string | null;
      author: string | null;
      author_avatar_url: string | null;
      review_comments: PrReviewComment[];
      issue_comments: PrIssueComment[];
    } & PrLiveState)
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

export type PrOverviewLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrOverviewResult>;

const defaultPrOverviewLoader: PrOverviewLoader = async ({ repo, number }) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/overview?${qs}`)) as PrOverviewResult;
};

// rehype-sanitize schema based on the GitHub default but with a few extras
// commonly found in PR bodies: image dimensions, video poster, and `align` on
// images / paragraphs (GitHub authors lean on these often).
const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...((defaultSchema.attributes?.img as Array<unknown>) ?? []),
      "align",
      "width",
      "height",
      "loading",
      "style",
    ],
    a: [
      ...((defaultSchema.attributes?.a as Array<unknown>) ?? []),
      "rel",
      "target",
    ],
    "*": [
      ...((defaultSchema.attributes?.["*"] as Array<unknown>) ?? []),
      "align",
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "video",
    "source",
  ],
};

// Hosts whose images Chrome blocks under ORB or that require a github auth
// token to fetch (user-attachments). These need to go through our worker
// proxy at /api/github/asset, which fetches server-side with the user's
// token and re-emits the bytes from our origin.
const GITHUB_ASSET_PROXY_HOSTS = new Set([
  "github.com",
  "user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
]);

function proxyGithubAssetUrl(
  src: string | undefined,
  authToken: string | null,
): string | undefined {
  if (!src) return src;
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return src;
  }
  if (parsed.protocol !== "https:") return src;
  if (!GITHUB_ASSET_PROXY_HOSTS.has(parsed.hostname)) return src;
  const qs = `url=${encodeURIComponent(parsed.toString())}${
    authToken ? `&auth=${encodeURIComponent(authToken)}` : ""
  }`;
  return `/api/github/asset?${qs}`;
}

function useSupabaseAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return token;
}

function Markdown({ children }: { children: string }) {
  const authToken = useSupabaseAccessToken();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
        a: ({ node: _n, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        img: ({ node: _n, src, ...props }) => (
          <img
            {...props}
            src={proxyGithubAssetUrl(
              typeof src === "string" ? src : undefined,
              authToken,
            )}
            loading="lazy"
            alt={props.alt ?? ""}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function groupCommentsByPath(
  comments: PrReviewComment[],
): Record<string, PrReviewComment[]> {
  const out: Record<string, PrReviewComment[]> = {};
  for (const c of comments) {
    if (!c.path) continue;
    if (!out[c.path]) out[c.path] = [];
    out[c.path].push(c);
  }
  return out;
}

export type DiffRow = {
  raw: string;
  tone: "hunk" | "ctx" | "add" | "del";
  oldLine?: number;
  newLine?: number;
};

// Parse a unified patch into rows annotated with each side's file line
// number. Inline review comments target one of those line numbers.
export function parsePatch(patch: string): DiffRow[] {
  const lines = patch.split("\n");
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of lines) {
    if (raw.startsWith("@@")) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push({ raw, tone: "hunk" });
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      rows.push({ raw, tone: "add", newLine });
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") && !raw.startsWith("---")) {
      rows.push({ raw, tone: "del", oldLine });
      oldLine += 1;
      continue;
    }
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ raw, tone: "ctx" });
      continue;
    }
    rows.push({ raw, tone: "ctx", oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }
  return rows;
}

export type ReviewDraftSide = "LEFT" | "RIGHT";

export type ReviewDraft = {
  path: string;
  line: number;
  side: ReviewDraftSide;
  /** Inclusive start of a multi-line range. Omit for single-line drafts. */
  startLine?: number;
  body: string;
};

export function reviewDraftKey(d: {
  path: string;
  line: number;
  side: ReviewDraftSide;
  startLine?: number;
}): string {
  return `${d.path}|${d.side}|${d.startLine ?? d.line}-${d.line}`;
}

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

export function PrReviewSubmitPanel({
  repo,
  number,
  drafts,
  onCleared,
  submit = defaultPrReviewSubmit,
}: {
  repo: string;
  number: number;
  drafts: Record<string, ReviewDraft>;
  onCleared: () => void;
  submit?: PrReviewSubmit;
}) {
  const draftList = Object.values(drafts);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<PrReviewEvent>("COMMENT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (draftList.length === 0) return null;
  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const out = await submit({
        repo,
        number,
        event,
        body: body.trim() || undefined,
        comments: draftList.map((d) => {
          const out: PrReviewSubmitDraft = {
            path: d.path,
            line: d.line,
            side: d.side,
            body: d.body,
          };
          if (typeof d.startLine === "number" && d.startLine < d.line) {
            out.start_line = d.startLine;
            out.start_side = d.side;
          }
          return out;
        }),
      } as Parameters<PrReviewSubmit>[0]);
      if (!out.ok) {
        setError(out.error ?? "submission failed");
        return;
      }
      onCleared();
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section
      aria-label="Pending review"
      data-slot="review-submit-panel"
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--primary)",
        background: "var(--surface-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <header className="flex items-center" style={{ gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Pending review · {draftList.length}
          {draftList.length === 1 ? " comment" : " comments"}
        </span>
        <button
          type="button"
          onClick={onCleared}
          className="ml-auto"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          Discard all
        </button>
      </header>
      <ul
        className="m-0 flex flex-col"
        style={{ gap: 4, fontSize: 12, padding: 0, listStyle: "none" }}
      >
        {draftList.map((d) => (
          <li
            key={reviewDraftKey(d)}
            className="flex items-center"
            style={{ gap: 8, color: "var(--muted-foreground)" }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                color: "var(--ink)",
              }}
            >
              {d.path}:{d.line}
            </span>
            <span className="truncate">{d.body}</span>
          </li>
        ))}
      </ul>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional review summary"
        aria-label="Review summary"
        rows={2}
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
      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
        {(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as PrReviewEvent[]).map(
          (ev) => (
            <label
              key={ev}
              className="inline-flex items-center"
              style={{ gap: 6, fontSize: 12, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="review-event"
                value={ev}
                checked={event === ev}
                onChange={() => setEvent(ev)}
              />
              {ev === "APPROVE"
                ? "Approve"
                : ev === "REQUEST_CHANGES"
                  ? "Request changes"
                  : "Comment"}
            </label>
          ),
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="ml-auto"
          style={{
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 6,
            border: 0,
            background: submitting ? "var(--surface-strong)" : "var(--primary)",
            color: submitting ? "var(--muted-foreground)" : "var(--canvas)",
            cursor: submitting ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="m-0"
          style={{ fontSize: 12, color: "var(--destructive)" }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

export function PrReviewActions({
  repo,
  number,
  signalId,
  submit = defaultPrReviewSubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  repo: string;
  number: number;
  signalId?: string;
  submit?: PrReviewSubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PrReviewEvent | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok"; event: PrReviewEvent }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("github");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setBody(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const run = async (event: PrReviewEvent) => {
    setPending(event);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        repo,
        number,
        event,
        body: body.trim(),
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok", event });
        setBody("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "review failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "review failed",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-label="PR review actions"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment (required for Request changes / Comment)"
        aria-label="Review comment"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("APPROVE")}
          disabled={pending !== null}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending === "APPROVE" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => run("REQUEST_CHANGES")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending === "REQUEST_CHANGES" ? "Sending…" : "Request changes"}
        </button>
        <button
          type="button"
          onClick={() => run("COMMENT")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending === "COMMENT" ? "Sending…" : "Comment"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending !== null}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">
          {status.event === "APPROVE"
            ? "Approved."
            : status.event === "REQUEST_CHANGES"
              ? "Changes requested."
              : "Comment posted."}
        </output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize GitHub"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function SlackDetail({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channel = signal.payload?.channel as string | undefined;
  const channelName = signal.payload?.channel_name as string | undefined;
  const channelType = signal.payload?.channel_type as string | undefined;
  const author = signal.payload?.author as string | undefined;
  const authorName = signal.payload?.author_name as string | undefined;
  const text = signal.payload?.text as string | undefined;
  const ts = signal.payload?.ts as string | undefined;
  const threadTs = signal.payload?.thread_ts as string | undefined;
  const where =
    channelType === "im"
      ? "Direct message"
      : channelName
        ? `#${channelName}`
        : channel
          ? `#${channel}`
          : null;
  return (
    <div data-slot="slack-detail" className="mt-3 space-y-4 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {where && (
          <>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="text-foreground">{where}</dd>
          </>
        )}
        {author && (
          <>
            <dt className="text-muted-foreground">From</dt>
            <dd className="text-foreground">
              {authorName ? authorName : `<@${author}>`}
            </dd>
          </>
        )}
      </dl>
      {text && !threadTs && (
        <blockquote className="whitespace-pre-line border-l-2 border-border pl-3 text-muted-foreground">
          {text}
        </blockquote>
      )}
      {channel && threadTs && (
        <SlackThreadContext channel={channel} thread_ts={threadTs} />
      )}
      {channel && (
        <SlackReplyComposer
          channel={channel}
          channelName={channelName}
          thread_ts={threadTs ?? ts}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
}

type SlackThreadMessage = {
  ts: string;
  user_id: string | null;
  user_name: string | null;
  text: string;
  is_self: boolean;
};

type SlackThreadResult =
  | { ok: true; messages: SlackThreadMessage[] }
  | { ok: false; error: string; needs_reauth?: boolean };

type SlackThreadLoader = (params: {
  channel: string;
  thread_ts: string;
}) => Promise<SlackThreadResult>;

const defaultSlackThreadLoader: SlackThreadLoader = async ({
  channel,
  thread_ts,
}) => {
  const qs = `channel=${encodeURIComponent(channel)}&thread_ts=${encodeURIComponent(
    thread_ts,
  )}`;
  return (await apiFetch(`/api/slack/thread?${qs}`)) as SlackThreadResult;
};

export function SlackThreadContext({
  channel,
  thread_ts,
  load = defaultSlackThreadLoader,
}: {
  channel: string;
  thread_ts: string;
  load?: SlackThreadLoader;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; messages: SlackThreadMessage[] }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    load({ channel, thread_ts })
      .then((out) => {
        if (cancelled) return;
        if (out.ok) {
          setState({ kind: "ok", messages: out.messages });
        } else {
          setState({ kind: "error", message: out.error });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "failed to load thread",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [channel, thread_ts, load]);

  if (state.kind === "loading") {
    return <p className="text-xs text-muted-foreground">Loading thread…</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-xs text-rose-700" role="alert">
        Couldn't load thread: {state.message}
      </p>
    );
  }
  if (state.messages.length === 0) {
    return null;
  }
  return (
    <section
      aria-label="Thread context"
      className="space-y-2 rounded-md border border-border bg-background p-3"
    >
      <header className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Thread
      </header>
      <ol className="space-y-2">
        {state.messages.map((m) => (
          <li
            key={m.ts}
            className={cn(
              "rounded px-2 py-1.5 text-xs",
              m.is_self ? "bg-muted" : "bg-muted/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
              <span className="font-medium text-foreground">
                {m.user_name ?? (m.user_id ? `<@${m.user_id}>` : "(unknown)")}
                {m.is_self && (
                  <span className="ml-1 text-muted-foreground">(you)</span>
                )}
              </span>
              <time className="tabular-nums">{formatSlackTs(m.ts)}</time>
            </div>
            <p className="mt-0.5 whitespace-pre-line text-foreground">
              {m.text || "(empty message)"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatSlackTs(ts: string): string {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds)) return ts;
  const d = new Date(seconds * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type SlackReplySubmit = (params: {
  channel: string;
  text: string;
  thread_ts?: string;
  signal_id?: string;
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

const defaultSlackReplySubmit: SlackReplySubmit = async (params) =>
  (await apiFetch("/api/slack/reply", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

export function SlackReplyComposer({
  channel,
  channelName,
  thread_ts,
  signalId,
  submit = defaultSlackReplySubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  channel: string;
  channelName?: string;
  thread_ts?: string;
  signalId?: string;
  submit?: SlackReplySubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channelLabel = channelName ?? channel;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok" }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);
  // When the signal lives inside a thread, default to replying in-thread.
  const [asNewMessage, setAsNewMessage] = useState(false);
  const effectiveThreadTs = asNewMessage ? undefined : thread_ts;

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("slack");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setText(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    setPending(true);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        channel,
        text: text.trim(),
        thread_ts: effectiveThreadTs,
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok" });
        setText("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "reply failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reply failed",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-label="Slack reply composer"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          effectiveThreadTs
            ? "Reply in thread…"
            : `Send a message to #${channelLabel}`
        }
        aria-label="Slack reply"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      {thread_ts && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={asNewMessage}
            onChange={(e) => setAsNewMessage(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Send as a new message in #{channelLabel} (don't reply in thread)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || text.trim().length === 0}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background hover:bg-foreground/90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">Reply sent.</output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize Slack"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}


