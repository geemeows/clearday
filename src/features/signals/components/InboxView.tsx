// Inbox page — two-panel split: signal list (left) + detail pane (right).

import { useState } from "react";
import { Button } from "#/components/ui/button";
import { CheckCheckIcon } from "lucide-react";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { SourceFilter } from "#/features/signals/components/SourceFilter";
import { PRDetail } from "#/features/signals/details/PRDetail";
import { SlackDetail } from "#/features/signals/details/SlackDetail";
import { MeetingDetail } from "#/features/signals/details/MeetingDetail";
import { TaskDetail } from "#/features/signals/details/TaskDetail";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InboxSignal = {
  id: string;
  /** Source key: "git" | "slack" | "cal" | "task" */
  source: string;
  kind: string;
  title: string;
  repo?: string;
  num?: string;
  author?: string;
  sub?: string;
  /** ISO timestamp */
  age: string;
  unread: number;
  summary?: string;
  severity?: "high" | "warn";
  badge?: "auto-rule";
  requires_action?: boolean;
  url?: string | null;
  diff?: { add: number; del: number; files: number };
  thread?: Array<{ who: string; text: string; when: string }>;
  agenda?: string[];
  /** Slack channel id — used by SlackDetail to post replies */
  channel?: string | null;
  /** Slack thread_ts — used by SlackDetail to post replies */
  thread_ts?: string | null;
  /** Signal id for backend tracking */
  signalId?: string;
  /** Calendar-meeting payload data */
  meetingNotes?: string | null;
  meetingAttendees?: Array<{ email: string | null; name: string | null; response: string | null; organizer: boolean }>;
};

export type InboxFilter = "all" | "prs" | "tickets" | "mentions" | "meetings";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sourceMatchesFilter(source: string, filter: InboxFilter): boolean {
  if (filter === "all") return true;
  if (filter === "prs") return source === "git";
  if (filter === "tickets") return source === "task";
  if (filter === "mentions") return source === "slack";
  if (filter === "meetings") return source === "cal";
  return true;
}

// ── InboxRow ──────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: "high" | "warn" }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        background:
          severity === "high"
            ? "var(--destructive, #ef4444)"
            : "var(--warn, #f59e0b)",
        color: "white",
        flexShrink: 0,
      }}
    >
      {severity === "high" ? "CI fail" : "Conflict"}
    </span>
  );
}

type InboxRowProps = {
  signal: InboxSignal;
  selected: boolean;
  onClick: () => void;
};

export function InboxRow({ signal: s, selected, onClick }: InboxRowProps) {
  const ago = relAgo(s.age);
  const sub =
    s.repo && s.diff
      ? `${s.repo} ${s.num} · ${s.author} · +${s.diff.add} −${s.diff.del}`
      : s.repo
        ? `${s.repo} ${s.num} · ${s.author}`
        : (s.sub ?? "");

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        padding: "12px 16px",
        border: "none",
        background: selected ? "var(--secondary)" : "transparent",
        borderLeft: selected
          ? "2px solid var(--primary)"
          : "2px solid transparent",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
        borderBottom: "1px solid var(--hairline-soft, var(--border))",
        alignItems: "start",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background =
            "var(--surface-soft)";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Source glyph + unread badge */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          paddingTop: 2,
        }}
      >
        <SourceGlyph source={s.source} size={20} />
        {s.unread > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "var(--primary-foreground)",
              background: "var(--primary)",
              minWidth: 16,
              padding: "1px 4px",
              borderRadius: 999,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {s.unread}
          </span>
        )}
      </div>
      {/* Title + sub */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          {s.severity && <SeverityBadge severity={s.severity} />}
          {s.badge === "auto-rule" && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--surface-strong)",
                color: "var(--muted-foreground, var(--muted))",
              }}
            >
              Rule
            </span>
          )}
          <span
            style={{
              fontSize: 13.5,
              fontWeight: s.unread > 0 ? 600 : 500,
              color: "var(--foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {s.title}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--muted-foreground, var(--muted))",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      </div>
      {/* Timestamp */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--muted-foreground, var(--muted))",
          paddingTop: 3,
          flexShrink: 0,
        }}
      >
        {ago}
      </div>
    </button>
  );
}

// ── InboxList ─────────────────────────────────────────────────────────────────

type InboxListProps = {
  signals: InboxSignal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
};

function InboxList({
  signals,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: InboxListProps) {
  const filtered = signals.filter((s) => sourceMatchesFilter(s.source, filter));
  const unreadCount = filtered.filter((s) => s.unread > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{ fontSize: 18, fontWeight: 600, color: "var(--ink, var(--foreground))" }}
          >
            Inbox
          </span>
          <span
            style={{
              marginLeft: 10,
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--muted-foreground, var(--muted))",
            }}
          >
            {unreadCount} unread · {filtered.length} total
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm">
            <CheckCheckIcon />
            Mark all read
          </Button>
        </div>
        <SourceFilter
          signals={signals}
          active={filter}
          onChange={onFilterChange}
        />
      </div>
      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map((s) => (
          <InboxRow
            key={s.id}
            signal={s}
            selected={s.id === selectedId}
            onClick={() => onSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── InboxDetail ───────────────────────────────────────────────────────────────

function InboxDetail({
  signal,
  onDismiss,
}: {
  signal: InboxSignal | undefined;
  onDismiss?: (id: string) => void;
}) {
  if (!signal) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-foreground, var(--muted))",
          fontSize: 14,
        }}
      >
        Select a signal
      </div>
    );
  }

  const dismissBar = onDismiss && (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "6px 16px",
        borderBottom: "1px solid var(--hairline-soft, var(--border))",
        background: "var(--surface-soft)",
        flexShrink: 0,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDismiss(signal.id)}
        style={{ fontSize: 11 }}
      >
        Dismiss
      </Button>
    </div>
  );

  if (signal.source === "git") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {dismissBar}
      <div style={{ flex: 1, overflow: "hidden" }}><PRDetail signal={signal} /></div>
    </div>
  );
  if (signal.source === "slack") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {dismissBar}
      <div style={{ flex: 1, overflow: "hidden" }}><SlackDetail signal={signal} /></div>
    </div>
  );
  if (signal.source === "cal") return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {dismissBar}
      <div style={{ flex: 1, overflow: "hidden" }}><MeetingDetail signal={signal} /></div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {dismissBar}
      <div style={{ flex: 1, overflow: "hidden" }}><TaskDetail signal={signal} /></div>
    </div>
  );
}

// ── InboxView ─────────────────────────────────────────────────────────────────

type InboxViewProps = {
  signals: InboxSignal[];
  defaultSelectedId?: string;
  onDismiss?: (id: string) => void;
};

export function InboxView({ signals, defaultSelectedId, onDismiss }: InboxViewProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultSelectedId ?? signals[0]?.id ?? null,
  );

  const selected = signals.find((s) => s.id === selectedId);

  if (signals.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          color: "var(--muted-foreground, var(--muted))",
        }}
      >
        <div style={{ fontSize: 32 }}>📭</div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Inbox is empty</div>
        <div style={{ fontSize: 13 }}>No signals to review right now.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <InboxList
          signals={signals}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--background)",
        }}
      >
        <InboxDetail signal={selected} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

// ── StoredSignal → InboxSignal mapper ─────────────────────────────────────────

import type { StoredSignal } from "#/shared/signal";

const PROVIDER_TO_SOURCE: Record<string, string> = {
  github: "git",
  google: "cal",
  slack: "slack",
  linear: "task",
  jira: "task",
};

const KIND_MAP: Record<string, string> = {
  pr_review_requested: "pr-review",
  pr_authored: "pr-review",
  pr_assigned: "pr-review",
  meeting: "meeting",
  dm: "dm",
  mention: "mention",
  thread_reply: "thread",
  ticket_assigned: "ticket-assigned",
  ticket_in_progress: "ticket-assigned",
  ticket_in_review: "ticket-assigned",
  ticket_blocked: "ticket-assigned",
};

/**
 * Convert a StoredSignal row (from Supabase) to the InboxSignal shape used
 * by InboxView and the detail panes.
 */
export function storedSignalToInboxSignal(s: StoredSignal): InboxSignal {
  const source = PROVIDER_TO_SOURCE[s.provider] ?? s.provider;
  const kind = KIND_MAP[s.kind] ?? s.kind;

  const p = s.payload as Record<string, unknown>;

  // GitHub PR fields
  const repo = typeof p.repo === "string" ? p.repo : undefined;
  const num = typeof p.number === "number" ? `#${p.number}` : undefined;
  const author = typeof p.author === "string" ? p.author : undefined;
  const additions = typeof p.additions === "number" ? p.additions : undefined;
  const deletions = typeof p.deletions === "number" ? p.deletions : undefined;
  const changedFiles = typeof p.changed_files === "number" ? p.changed_files : undefined;
  const diff =
    additions !== undefined && deletions !== undefined && changedFiles !== undefined
      ? { add: additions, del: deletions, files: changedFiles }
      : undefined;

  // Slack fields
  const channel = typeof p.channel === "string" ? p.channel : null;
  const threadTs = typeof p.thread_ts === "string" ? p.thread_ts : null;

  // Google Calendar / meeting fields
  const agenda = Array.isArray(p.agenda) ? (p.agenda as string[]) : undefined;
  const description = typeof p.description === "string" ? p.description : null;
  const rawAttendees = Array.isArray(p.attendees) ? p.attendees as Array<Record<string, unknown>> : [];
  const meetingAttendees = rawAttendees.map((a) => ({
    email: typeof a.email === "string" ? a.email : null,
    name: typeof a.name === "string" ? a.name : null,
    response: typeof a.response === "string" ? a.response : null,
    organizer: a.organizer === true,
  }));

  // Sub-label: human-readable secondary line
  let sub: string | undefined;
  if (source === "slack") {
    sub = s.title;
  } else if (source === "cal" && meetingAttendees.length > 0) {
    sub = `${meetingAttendees.length} attendee${meetingAttendees.length !== 1 ? "s" : ""}`;
  } else if (source === "task") {
    sub = s.title;
  }

  return {
    id: s.id,
    source,
    kind,
    title: s.title,
    repo,
    num,
    author,
    sub,
    age: s.source_created_at ?? s.created_at,
    unread: s.unread_count,
    url: s.url ?? null,
    requires_action: s.requires_action,
    diff,
    channel,
    thread_ts: threadTs,
    signalId: s.id,
    agenda: agenda?.length ? agenda : undefined,
    meetingNotes: description,
    meetingAttendees: meetingAttendees.length > 0 ? meetingAttendees : undefined,
  };
}
