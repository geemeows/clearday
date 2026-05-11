import type { ReactNode } from "react";
import { useMemo } from "react";
import { StatusBadge } from "#/components/ui/StatusBadge";
import {
  InboxPreviewRow,
  InboxPreviewRowSkeleton,
} from "#/features/signals/components/InboxPreviewRow";
import {
  SourceFilter,
  type SourceProvider,
  type SourceSelection,
} from "#/features/signals/components/SourceFilter";
import {
  computeFilterCounts,
  type Filter,
  filterToGroup,
  formatSnoozeReturn,
  kindGroup,
  severityOf,
} from "#/features/signals/display";
import { cn } from "#/lib/cn";
import type { Signal } from "#/shared/signal";

export type StoredSignal = Signal & {
  id: string;
  dismissed_at: string | null;
  priority?: "low" | "high" | null;
  snoozed_until?: string | null;
  unread_count?: number;
};

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "prs", label: "PRs" },
  { id: "tickets", label: "Tickets" },
  { id: "mentions", label: "Mentions" },
  { id: "meetings", label: "Meetings" },
];

const SKELETON_ROWS = [
  { id: "sk-a", width: "78%" },
  { id: "sk-b", width: "55%" },
  { id: "sk-c", width: "82%" },
  { id: "sk-d", width: "44%" },
  { id: "sk-e", width: "70%" },
  { id: "sk-f", width: "60%" },
  { id: "sk-g", width: "76%" },
  { id: "sk-h", width: "50%" },
];

export type RenderDetailArgs = {
  selected: StoredSignal | null;
  onClose: () => void;
};

function defaultDetail(): ReactNode {
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

export function InboxView({
  filter,
  onFilterChange,
  source,
  onSourceChange,
  sourceProviders,
  signals,
  error,
  onDismiss,
  selectedId = null,
  onSelect,
  repliedIds,
  onReplyStart,
  onReplyRollback,
  renderDetail,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  /**
   * Source axis (provider + optional account_id) layered on top of the kind
   * filter. Optional so existing tests / call sites that only care about
   * the kind chips keep working — when omitted, the source rail is hidden
   * and the inbox stays unified across all accounts.
   */
  source?: SourceSelection;
  onSourceChange?: (next: SourceSelection) => void;
  sourceProviders?: SourceProvider[];
  signals: StoredSignal[] | null;
  error: string | null;
  onDismiss: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  repliedIds?: ReadonlySet<string>;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
  renderDetail?: (args: RenderDetailArgs) => ReactNode;
}) {
  // onDismiss is forwarded to renderDetail callers via closure in the route;
  // it's accepted here so existing call sites and tests keep working.
  void onDismiss;
  void onReplyStart;
  void onReplyRollback;
  const nowIso = new Date().toISOString();
  const counts = useMemo(
    () => (signals ? computeFilterCounts(signals) : null),
    [signals],
  );
  const visible = useMemo(() => {
    if (!signals) return null;
    const group = filterToGroup(filter);
    if (group == null) return signals;
    return signals.filter((s) => kindGroup(s.kind) === group);
  }, [signals, filter]);
  const selected = useMemo(
    () => visible?.find((s) => s.id === selectedId) ?? null,
    [visible, selectedId],
  );
  const total = visible?.length ?? 0;
  const unread = visible
    ? visible.filter(
        (s) => typeof s.unread_count === "number" && s.unread_count > 0,
      ).length
    : 0;

  if (error) {
    return (
      <section className="flex h-full min-h-0 flex-col px-8 pt-6">
        <p className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      </section>
    );
  }

  if (visible == null) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading inbox"
        className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]"
        style={{ background: "var(--canvas)" }}
      >
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          style={{ borderRight: "1px solid var(--hairline-soft)" }}
        >
          <div
            className="flex flex-col gap-3 px-[18px] pt-4 pb-3"
            style={{ borderBottom: "1px solid var(--hairline-soft)" }}
          >
            <div className="flex items-baseline">
              <h1
                className="font-semibold"
                style={{
                  fontSize: 20,
                  lineHeight: 1.25,
                  letterSpacing: "-0.2px",
                  color: "var(--ink)",
                }}
              >
                Inbox
              </h1>
              <span
                className="ml-2.5 font-medium"
                style={{
                  fontSize: 12,
                  lineHeight: 1.3,
                  color: "var(--muted-foreground)",
                }}
              >
                — unread · — total
              </span>
              <span className="flex-1" />
              <button
                type="button"
                disabled
                className="rounded-md px-3"
                style={{
                  height: 30,
                  fontSize: 12,
                  color: "var(--ink)",
                  opacity: 0.5,
                }}
              >
                Mark all read
              </button>
            </div>
            <nav
              aria-label="Inbox filters"
              className="flex flex-wrap items-center gap-1.5"
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    type="button"
                    key={f.id}
                    aria-pressed={active}
                    onClick={() => onFilterChange(f.id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
                    style={{
                      fontSize: 13,
                      background: active ? "var(--ink)" : "var(--surface-soft)",
                      color: active ? "var(--canvas)" : "var(--ink)",
                      border: "1px solid transparent",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {SKELETON_ROWS.map(({ id, width }) => (
              <li
                key={id}
                style={{
                  borderLeft: "2px solid transparent",
                  borderBottom: "1px solid var(--hairline-soft)",
                  padding: "2px 6px",
                }}
              >
                <InboxPreviewRowSkeleton titleWidth={width} />
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: "var(--canvas)" }} />
      </section>
    );
  }

  if (visible.length === 0) {
    return (
      <section
        className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-8 text-center"
        style={{ background: "var(--canvas)" }}
      >
        <p
          className="font-semibold tracking-tight"
          style={{ fontSize: 16, color: "var(--ink)" }}
        >
          Nothing here.
        </p>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          New signals show up automatically.
        </p>
      </section>
    );
  }

  const detailNode = renderDetail
    ? renderDetail({ selected, onClose: () => onSelect?.(null) })
    : defaultDetail();

  return (
    <section
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[420px_1fr]"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ borderRight: "1px solid var(--hairline-soft)" }}
      >
        <div
          className="flex flex-col gap-3 px-[18px] pt-4 pb-3"
          style={{ borderBottom: "1px solid var(--hairline-soft)" }}
        >
          <div className="flex items-baseline">
            <h1
              className="font-semibold"
              style={{
                fontSize: 20,
                lineHeight: 1.25,
                letterSpacing: "-0.2px",
                color: "var(--ink)",
              }}
            >
              Inbox
            </h1>
            <span
              className="ml-2.5 font-medium"
              style={{
                fontSize: 12,
                lineHeight: 1.3,
                color: "var(--muted-foreground)",
              }}
            >
              {unread} unread · {total} total
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="rounded-md px-3 hover:bg-(--surface-soft)"
              style={{ height: 30, fontSize: 12, color: "var(--ink)" }}
            >
              Mark all read
            </button>
          </div>
          {sourceProviders && source && onSourceChange && (
            <SourceFilter
              providers={sourceProviders}
              value={source}
              onChange={onSourceChange}
            />
          )}
          <nav
            aria-label="Inbox filters"
            className="flex flex-wrap items-center gap-1.5"
          >
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  type="button"
                  key={f.id}
                  aria-pressed={active}
                  onClick={() => onFilterChange(f.id)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
                  style={{
                    fontSize: 13,
                    background: active ? "var(--ink)" : "var(--surface-soft)",
                    color: active ? "var(--canvas)" : "var(--ink)",
                    border: "1px solid transparent",
                  }}
                >
                  {f.label}
                  {counts && (
                    <span
                      data-slot="filter-count"
                      className="tabular-nums"
                      style={{ fontSize: 11, opacity: 0.6 }}
                    >
                      {counts[f.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {visible.map((s) => (
            <InboxRow
              key={s.id}
              signal={s}
              selected={selectedId === s.id}
              replied={repliedIds?.has(s.id) ?? false}
              snoozed={!!s.snoozed_until && s.snoozed_until > nowIso}
              onSelect={() => onSelect?.(s.id)}
              nowIso={nowIso}
            />
          ))}
        </ul>
      </div>
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ background: "var(--canvas)" }}
      >
        {detailNode}
      </div>
    </section>
  );
}

export function InboxRow({
  signal,
  selected,
  replied,
  snoozed,
  onSelect,
  nowIso,
}: {
  signal: StoredSignal;
  selected: boolean;
  replied: boolean;
  snoozed: boolean;
  onSelect: () => void;
  nowIso: string;
}) {
  const severity = severityOf(signal);
  const isAutoRule = signal.payload?.badge === "auto-rule";
  const chips = (
    <>
      {severity === "ci_fail" && (
        <StatusBadge tone="danger">CI FAIL</StatusBadge>
      )}
      {severity === "conflict" && (
        <StatusBadge tone="warning">CONFLICT</StatusBadge>
      )}
      {isAutoRule && <StatusBadge tone="muted">RULE</StatusBadge>}
      {replied && <StatusBadge tone="success">Replied</StatusBadge>}
      {signal.priority === "high" && (
        <StatusBadge tone="danger">High</StatusBadge>
      )}
      {signal.priority === "low" && <StatusBadge tone="muted">Low</StatusBadge>}
      {snoozed && (
        <StatusBadge
          tone="warning"
          title={`Returns at ${formatSnoozeReturn(signal.snoozed_until)}`}
        >
          Snoozed · returns {formatSnoozeReturn(signal.snoozed_until)}
        </StatusBadge>
      )}
    </>
  );
  return (
    <li
      data-selected={selected || undefined}
      className={cn((replied || snoozed) && "opacity-60")}
      style={{
        background: selected ? "var(--surface-soft)" : "transparent",
        borderLeft: `2px solid ${selected ? "var(--primary)" : "transparent"}`,
        borderBottom: "1px solid var(--hairline-soft)",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full"
        style={{ padding: "2px 6px" }}
      >
        <InboxPreviewRow
          signal={signal}
          nowIso={nowIso}
          chips={chips}
          unreadDisplay="count"
        />
      </button>
    </li>
  );
}
