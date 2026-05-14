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
  diff?: { add: number; del: number; files: number };
  thread?: Array<{ who: string; text: string; when: string }>;
  agenda?: string[];
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

function InboxDetail({ signal }: { signal: InboxSignal | undefined }) {
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
  if (signal.source === "git") return <PRDetail signal={signal} />;
  if (signal.source === "slack") return <SlackDetail signal={signal} />;
  if (signal.source === "cal") return <MeetingDetail signal={signal} />;
  return <TaskDetail signal={signal} />;
}

// ── InboxView ─────────────────────────────────────────────────────────────────

type InboxViewProps = {
  signals: InboxSignal[];
  defaultSelectedId?: string;
};

export function InboxView({ signals, defaultSelectedId }: InboxViewProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    defaultSelectedId ?? signals[0]?.id ?? null,
  );

  const selected = signals.find((s) => s.id === selectedId);

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
        <InboxDetail signal={selected} />
      </div>
    </div>
  );
}
