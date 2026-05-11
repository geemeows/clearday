import { createFileRoute } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StatusBadge } from "#/components/ui/StatusBadge";
import { UserAvatar } from "#/components/ui/UserAvatar";
import {
  providerOpenLabel,
  providerSourceKind,
  signalKindLabel,
} from "#/features/integrations/display";
import {
  createCard,
  getLinkForSignal,
  linkSignalToCard,
  listCards,
  listColumns,
  listProjects,
  type StoredCardSignal,
  type StoredProject,
} from "#/features/projects/store";
import {
  InboxView as BaseInboxView,
  InboxRow,
  type RenderDetailArgs,
  type StoredSignal,
} from "#/features/signals/components/InboxView";
import type {
  SourceProvider,
  SourceSelection,
} from "#/features/signals/components/SourceFilter";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { SignalDetail } from "#/features/signals/details";
import { MeetingDetail } from "#/features/signals/details/meeting";
import {
  AttendeeStack,
  type MeetingAttendee,
} from "#/features/signals/details/meeting/Attendees";
import { PRDetail } from "#/features/signals/details/pr";
import {
  type PrLiveState,
  parsePatch,
  reviewDraftKey,
} from "#/features/signals/details/pr/_shared";
import { PrComments } from "#/features/signals/details/pr/Comments";
import { PrDescription } from "#/features/signals/details/pr/Description";
import { PrDiffViewer } from "#/features/signals/details/pr/DiffViewer";
import { PrReviewActions } from "#/features/signals/details/pr/ReviewActions";
import { PrReviewSubmitPanel } from "#/features/signals/details/pr/ReviewComposer";
import { SlackDetail } from "#/features/signals/details/slack";
import { SlackReplyComposer } from "#/features/signals/details/slack/ReplyComposer";
import { SlackThreadContext } from "#/features/signals/details/slack/ThreadContext";
import { TaskDetail } from "#/features/signals/details/task";
import { type Filter, kindGroup, relAgo } from "#/features/signals/display";
import type { SourceStatus } from "#/features/signals/server/api";
import { filterMeetingsToToday } from "#/features/signals/views/today";
import { useAutoRefresh } from "#/hooks/use-auto-refresh";
import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
import type { SignalProvider } from "#/shared/signal";

export {
  InboxRow,
  AttendeeStack,
  MeetingDetail,
  TaskDetail,
  SlackDetail,
  SlackReplyComposer,
  SlackThreadContext,
  PRDetail,
  PrComments,
  PrDescription,
  PrDiffViewer,
  PrReviewActions,
  PrReviewSubmitPanel,
  parsePatch,
  reviewDraftKey,
};
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

const PROVIDER_LABEL: Record<SignalProvider, string> = {
  github: "GitHub",
  google: "Google Calendar",
  slack: "Slack",
  linear: "Linear",
  jira: "Jira",
};

function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [source, setSource] = useState<SourceSelection>({
    provider: null,
    accountId: null,
  });
  const [sourceProviders, setSourceProviders] = useState<
    SourceProvider[] | null
  >(null);
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
      const params = new URLSearchParams({ filter: "all" });
      if (source.provider) params.set("provider", source.provider);
      if (source.accountId) params.set("account_id", source.accountId);
      const body = (await apiFetch(`/api/signals?${params.toString()}`)) as {
        signals: StoredSignal[];
      };
      setSignals(body.signals);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    }
  }, [source.provider, source.accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Load the connected-account list once for the source filter chip rail.
  // Falls back to "no providers" on auth/network failure — the rail then
  // renders only the "All sources" chip and the inbox stays unified.
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/sources")
      .then((body) => {
        if (cancelled) return;
        const sources = (body as { sources: SourceStatus[] }).sources;
        const byProvider = new Map<SignalProvider, SourceProvider>();
        for (const s of sources) {
          if (!s.id) continue; // neutral placeholders carry no account
          const provider = s.provider as SignalProvider;
          let bucket = byProvider.get(provider);
          if (!bucket) {
            bucket = {
              provider,
              label: PROVIDER_LABEL[provider] ?? provider,
              accounts: [],
            };
            byProvider.set(provider, bucket);
          }
          bucket.accounts.push({
            id: s.id,
            handle: s.handle,
            context: s.context,
            status: s.status,
          });
        }
        setSourceProviders([...byProvider.values()]);
      })
      .catch(() => {
        if (!cancelled) setSourceProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      source={source}
      onSourceChange={setSource}
      sourceProviders={sourceProviders ?? undefined}
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
          onOpenCard={(projectId, cardId) => {
            navigate({
              to: "/projects/$projectId",
              params: { projectId },
              search: { card: cardId },
            });
          }}
        />
      )}
    />
  );
}

type LinkInfo = {
  cardId: string;
  projectId: string;
};

export function InboxDetailPane({
  signal,
  onClose,
  onDismiss,
  onReplyStart,
  onReplyRollback,
  onOpenCard,
}: {
  signal: StoredSignal | null;
  onClose: () => void;
  onDismiss: (id: string) => void;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
  // Called when the user wants to navigate to the linked card.
  onOpenCard?: (projectId: string, cardId: string) => void;
}) {
  const client = supabase as unknown as SupabaseLike;
  const [liveState, setLiveState] = useState<PrLiveState | null>(null);
  // null = unchecked/not linked, 'loading' = pending DB check, LinkInfo = linked
  const [linkState, setLinkState] = useState<null | "loading" | LinkInfo>(null);
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  // Prevents stale project loads from racing when signals change quickly.
  const projectLoadId = useRef(0);

  const signalId = signal?.id;
  // Reset whenever a different signal is selected so the chip doesn't
  // briefly show the previous PR's merged state. Biome can't see that
  // signalId is the trigger (the body doesn't read it), but we need the
  // effect to refire on selection change.
  useEffect(() => {
    setLiveState(null);
    setShowPicker(false);
    if (!signalId) {
      setLinkState(null);
      return;
    }
    setLinkState("loading");
    let cancelled = false;
    getLinkForSignal(client, signalId)
      .then((link: StoredCardSignal | null) => {
        if (cancelled) return;
        if (!link) {
          setLinkState(null);
          return;
        }
        setLinkState({ cardId: link.card_id, projectId: link.project_id });
        // Load projects for the "Open card · {project}" label.
        const loadId = ++projectLoadId.current;
        listProjects(client)
          .then((ps: StoredProject[]) => {
            if (!cancelled && loadId === projectLoadId.current) setProjects(ps);
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setLinkState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signalId]);

  const openPicker = async () => {
    setShowPicker(true);
    if (projects === null) {
      const ps = await listProjects(client);
      setProjects(ps);
    }
  };

  const handleSendToProject = async (project: StoredProject) => {
    if (!signal) return;
    setSending(true);
    try {
      const cols = await listColumns(client, project.id);
      const firstCol = cols[0];
      if (!firstCol) throw new Error("no columns");
      const existingCards = await listCards(client, project.id);
      const cardsInFirstCol = existingCards.filter(
        (c) => c.column_id === firstCol.id,
      );
      const order = cardsInFirstCol.length;
      const cardId = crypto.randomUUID();
      await createCard(client, {
        id: cardId,
        project_id: project.id,
        column_id: firstCol.id,
        order,
        title: signal.title,
      });
      await linkSignalToCard(client, signal.id, cardId, project.id);
      setLinkState({ cardId, projectId: project.id });
      setProjects((prev) => (prev ? prev : [project]));
      setShowPicker(false);
    } catch {
      // Best-effort; leave picker open so user can retry.
    } finally {
      setSending(false);
    }
  };

  const linkedProject =
    typeof linkState === "object" && linkState !== null
      ? (projects ?? []).find((p) => p.id === linkState.projectId)
      : undefined;

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
        {group === "pr" && (
          <PrStatusBadge signal={signal} liveState={liveState} />
        )}
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
      <SignalDetail
        signal={signal}
        onReplyStart={onReplyStart}
        onReplyRollback={onReplyRollback}
        onPrState={setLiveState}
      />
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
        {/* Send to project / Open card */}
        {linkState !== "loading" &&
          (typeof linkState === "object" && linkState !== null ? (
            <button
              type="button"
              data-slot="open-card"
              onClick={() =>
                onOpenCard?.(linkState.projectId, linkState.cardId)
              }
              className="inline-flex items-center gap-1 rounded-md hover:bg-(--surface-soft)"
              style={{
                height: 32,
                padding: "0 12px",
                fontSize: 13,
                color: "var(--muted-foreground)",
              }}
            >
              Open card{linkedProject ? ` · ${linkedProject.name}` : ""} →
            </button>
          ) : (
            <div className="relative">
              <button
                type="button"
                data-slot="send-to-project"
                onClick={openPicker}
                disabled={sending}
                className="inline-flex items-center gap-1 rounded-md hover:bg-(--surface-soft)"
                style={{
                  height: 32,
                  padding: "0 12px",
                  fontSize: 13,
                  color: "var(--muted-foreground)",
                }}
              >
                {sending ? "Sending…" : "Send to project"}
              </button>
              {showPicker && (
                <div
                  data-slot="project-picker"
                  className="absolute bottom-full left-0 z-10 mb-1 min-w-[180px] overflow-hidden rounded-lg shadow-md"
                  style={{
                    background: "var(--canvas)",
                    border: "1px solid var(--hairline-soft)",
                  }}
                >
                  {projects === null ? (
                    <div
                      className="px-3 py-2 text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Loading…
                    </div>
                  ) : projects.length === 0 ? (
                    <div
                      className="px-3 py-2 text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      No projects yet
                    </div>
                  ) : (
                    <ul>
                      {projects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => handleSendToProject(p)}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-(--surface-soft)"
                            style={{ color: "var(--ink)" }}
                          >
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
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
