// Task / ticket detail pane — shown when a task signal is selected in Inbox.

import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { InboxSignal } from "#/features/signals/components/InboxView";

type Props = { signal: InboxSignal };

export function TaskDetail({ signal: s }: Props) {
  const identifier = s.num ?? "";
  const provider = s.source === "task" ? "Linear" : s.source;

  return (
    <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <SourceGlyph source={s.source} size={18} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          {provider}
          {identifier ? ` · ${identifier}` : ""}
        </span>
      </div>

      <h1
        style={{
          margin: "0 0 6px",
          fontSize: 18,
          fontWeight: 600,
          color: "var(--foreground)",
        }}
      >
        {s.title}
      </h1>

      {s.sub && (
        <div
          style={{
            fontSize: 14,
            color: "var(--muted-foreground, var(--muted))",
          }}
        >
          {s.sub}
        </div>
      )}
    </div>
  );
}
