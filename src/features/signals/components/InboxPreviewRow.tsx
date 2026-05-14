import { SourceGlyph } from "#/features/signals/components/SourceGlyph";

export type PreviewSignal = {
  id: string;
  source: string;
  title: string;
  repo?: string;
  num?: string;
  author?: string;
  sub?: string;
  /** ISO timestamp. */
  age: string;
  unread: number;
};

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

type Props = {
  signal: PreviewSignal;
  onOpen?: () => void;
};

export function InboxPreviewRow({ signal: s, onOpen }: Props) {
  const ago = relAgo(s.age);
  const sub = s.repo ? `${s.repo} ${s.num} · ${s.author}` : (s.sub ?? "");
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "12px 12px",
        borderRadius: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background =
          "var(--surface-soft)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SourceGlyph source={s.source} size={20} />
        {s.unread > 0 && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--primary)",
            }}
          />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {s.title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--muted)",
          flexShrink: 0,
        }}
      >
        {ago}
      </div>
    </button>
  );
}
