import type { ReactNode } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import {
  providerSourceKind,
  signalKindLabel,
} from "#/features/integrations/display";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { relAgo, secondaryLabel } from "#/features/signals/display";
import type { Signal } from "#/shared/signal";

// Minimal row contract: a Signal plus optional unread_count (used elsewhere
// by both shared/signal's StoredSignal and the looser StoredSignal in
// _app.inbox.tsx).
type InboxPreviewSignal = Signal & { unread_count?: number };

// Shared inbox-preview row used by Today's "Needs you" card and (per PRD #54)
// the full Inbox page. Presentational only; callers wrap this in a <Link> or
// <button> to handle navigation/selection.
export function InboxPreviewRow({
  signal,
  nowIso,
  chips,
  unreadDisplay = "dot",
}: {
  signal: InboxPreviewSignal;
  nowIso: string;
  // Optional inline chips rendered before the title (e.g. CI FAIL, RULE, High,
  // Snoozed). Used by the Inbox page; Today's "Needs you" leaves this empty.
  chips?: ReactNode;
  // "dot" (default) renders a 6px primary dot next to the glyph.
  // "count" renders the unread count under the glyph with aria-label
  // "{n} unread" (matches the Devy Inbox row).
  unreadDisplay?: "dot" | "count";
}) {
  const unreadCount =
    typeof signal.unread_count === "number" && signal.unread_count > 0
      ? signal.unread_count
      : 0;
  const isUnread = unreadCount > 0;
  const subtitle = secondaryLabel(signal) || signalKindLabel(signal.kind);
  const stackedUnread = unreadDisplay === "count";
  return (
    <span
      data-slot="inbox-preview-row"
      className="grid w-full items-start gap-3 px-3 py-3 text-left"
      style={{ gridTemplateColumns: "auto 1fr auto" }}
    >
      <span
        className={
          stackedUnread
            ? "flex shrink-0 flex-col items-center gap-1.5 pt-0.5"
            : "flex items-center gap-2"
        }
      >
        <SourceGlyph source={providerSourceKind(signal.provider)} size={20} />
        {isUnread &&
          (stackedUnread ? (
            <span
              role="img"
              data-slot="unread-count"
              aria-label={`${unreadCount} unread`}
              className="font-bold tabular-nums"
              style={{ fontSize: 10, color: "var(--primary)" }}
            >
              {unreadCount}
            </span>
          ) : (
            <span
              role="img"
              data-slot="unread-dot"
              aria-label="Unread"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--primary)" }}
            />
          ))}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
          {chips}
          <span
            className="truncate text-foreground text-sm"
            style={{ fontWeight: isUnread ? 600 : 500 }}
          >
            {signal.title}
          </span>
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {subtitle}
        </span>
      </span>
      <time
        className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums"
        style={{ paddingTop: 3 }}
        dateTime={signal.source_created_at ?? undefined}
      >
        {relAgo(signal.source_created_at, nowIso)}
      </time>
    </span>
  );
}

// Loading placeholder mirroring InboxPreviewRow's geometry so the swap to real
// rows doesn't shift layout. `titleWidth` lets callers vary widths to avoid a
// uniform skeleton stack.
export function InboxPreviewRowSkeleton({
  titleWidth = "70%",
  unreadDisplay = "count",
}: {
  titleWidth?: string;
  unreadDisplay?: "dot" | "count";
}) {
  const stackedUnread = unreadDisplay === "count";
  return (
    <span
      data-slot="inbox-preview-row-skeleton"
      aria-hidden="true"
      className="grid w-full items-start gap-3 px-3 py-3"
      style={{ gridTemplateColumns: "auto 1fr auto" }}
    >
      <span
        className={
          stackedUnread
            ? "flex shrink-0 flex-col items-center gap-1.5 pt-0.5"
            : "flex items-center gap-2"
        }
      >
        <Skeleton className="size-5 rounded-md" />
        {stackedUnread && <Skeleton className="h-2.5 w-3 rounded-sm" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
          <Skeleton
            className="h-3.5 rounded-md"
            style={{ width: titleWidth }}
          />
        </span>
        <Skeleton className="h-3 w-2/5 rounded-sm" />
      </span>
      <Skeleton
        className="h-3 w-7 shrink-0 rounded-sm"
        style={{ marginTop: 3 }}
      />
    </span>
  );
}
