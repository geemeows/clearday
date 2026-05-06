import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { providerSourceKind, signalKindLabel } from "#/features/integrations/display";
import { relAgo, secondaryLabel } from "#/routes/_app.inbox";
import type { StoredSignal } from "#/shared/signal";

// Shared inbox-preview row used by Today's "Needs you" card and (per PRD #54)
// the full Inbox page. Presentational only; callers wrap this in a <Link> or
// <button> to handle navigation/selection.
export function InboxPreviewRow({
  signal,
  nowIso,
}: {
  signal: StoredSignal;
  nowIso: string;
}) {
  const unread =
    typeof signal.unread_count === "number" && signal.unread_count > 0;
  const subtitle = secondaryLabel(signal) || signalKindLabel(signal.kind);
  return (
    <span
      data-slot="inbox-preview-row"
      className="grid w-full items-center gap-3 px-3 py-3 text-left"
      style={{ gridTemplateColumns: "auto 1fr auto" }}
    >
      <span className="flex items-center gap-2">
        <SourceGlyph source={providerSourceKind(signal.provider)} size={20} />
        {unread && (
          <span
            data-slot="unread-dot"
            aria-label="Unread"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--primary)" }}
          />
        )}
      </span>
      <span className="min-w-0">
        <span
          className="block truncate font-semibold text-foreground text-sm"
          style={{ fontWeight: unread ? 600 : 500 }}
        >
          {signal.title}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {subtitle}
        </span>
      </span>
      <time
        className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums"
        dateTime={signal.source_created_at ?? undefined}
      >
        {relAgo(signal.source_created_at, nowIso)}
      </time>
    </span>
  );
}
