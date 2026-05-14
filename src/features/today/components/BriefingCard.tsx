import { SparklesIcon, RefreshCwIcon, PlugIcon, ExternalLinkIcon, RefreshCwOffIcon, CalendarIcon, SettingsIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { SourceId } from "#/features/signals/components/SourceGlyph";

export type BriefingItemPriority = "high" | "watch" | "plan" | "skip";

export type BriefingItemData = {
  id: string;
  priority: BriefingItemPriority;
  source: string;
  tag: string;
  title: string;
  body: string;
  reason: string;
  cta?: { label: string; icon: string };
};

export type BriefingData = {
  model: string;
  duration: string;
  generatedAt: string;
  headline: string;
  items: BriefingItemData[];
};

const PRIORITY_STYLES: Record<
  BriefingItemPriority,
  { dot: string; soft: string; label: string }
> = {
  high: {
    dot: "var(--brand-blue, #3b82f6)",
    soft: "var(--brand-blue-soft, #eff6ff)",
    label: "ACT NOW",
  },
  watch: {
    dot: "var(--warn, #f59e0b)",
    soft: "var(--warn-soft, #fffbeb)",
    label: "WATCH",
  },
  plan: {
    dot: "var(--brand-lavender, #8b5cf6)",
    soft: "var(--brand-lavender-soft, #f5f3ff)",
    label: "PLANNED",
  },
  skip: {
    dot: "var(--muted-foreground)",
    soft: "var(--surface-soft)",
    label: "AUTO",
  },
};

/** Map design fixture source names to SourceGlyph IDs. */
function normalizeSource(src: string): SourceId | string {
  if (src === "calendar") return "cal";
  return src;
}

function ctaIcon(name: string) {
  switch (name) {
    case "external-link":
      return <ExternalLinkIcon size={13} />;
    case "refresh-cw":
      return <RefreshCwIcon size={13} />;
    case "calendar":
      return <CalendarIcon size={13} />;
    case "settings":
      return <SettingsIcon size={13} />;
    default:
      return <RefreshCwOffIcon size={13} />;
  }
}

function BriefingItem({ item }: { item: BriefingItemData }) {
  const p = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.plan;
  return (
    <div
      style={{
        padding: "8px 12px 8px 14px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--background)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}
    >
      {/* Priority rail */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: p.dot,
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
        }}
      />
      {/* Tag column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 3,
          minWidth: 72,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: "2px 6px",
            borderRadius: 3,
            background: p.soft,
            color: p.dot,
            whiteSpace: "nowrap",
          }}
        >
          {p.label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            color: "var(--muted-foreground)",
          }}
        >
          {item.tag}
        </span>
      </div>
      {/* Title + body */}
      <div
        style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <SourceGlyph source={normalizeSource(item.source)} size={12} />
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--foreground)",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.title}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--muted-foreground)",
              flexShrink: 0,
            }}
          >
            · {item.reason}
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color: "var(--muted-foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.body}
        </div>
      </div>
      {/* CTA */}
      {item.cta && (
        <Button variant="ghost" size="sm">
          {ctaIcon(item.cta.icon)}
          {item.cta.label}
        </Button>
      )}
    </div>
  );
}

function BriefingEmpty({ onConnect }: { onConnect?: () => void }) {
  return (
    <div
      style={{
        padding: "20px 22px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 16,
        alignItems: "center",
        borderRadius: "var(--radius-lg)",
        border: "1px dashed var(--hairline-soft)",
        background: "var(--surface-soft)",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--surface-card)",
          border: "1px dashed var(--hairline-soft)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-foreground)",
          flexShrink: 0,
        }}
      >
        <SparklesIcon size={16} />
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
      >
        <span
          style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}
        >
          Morning rundown is off
        </span>
        <span
          style={{
            fontSize: 12,
            color: "var(--muted-foreground)",
            lineHeight: 1.45,
          }}
        >
          Connect an AI provider (Anthropic, OpenAI, Google, or Groq) and Devy
          will generate a daily briefing from your signals — your key, your
          inference, no shared model.
        </span>
      </div>
      <Button variant="default" size="sm" onClick={onConnect}>
        <PlugIcon size={13} />
        Connect provider
      </Button>
    </div>
  );
}

type Props = {
  data: BriefingData;
  /** Suppress the card entirely (e.g., meeting is imminent). */
  suppressed?: boolean;
  aiConnected: boolean;
  onConnect?: () => void;
};

export function BriefingCard({ data, suppressed, aiConnected, onConnect }: Props) {
  if (suppressed) return null;
  if (!aiConnected) return <BriefingEmpty onConnect={onConnect} />;
  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--hairline-soft)",
        background: "var(--surface-card)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background:
              "linear-gradient(135deg, var(--brand-blue, #3b82f6) 0%, var(--brand-lavender, #8b5cf6) 100%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            flexShrink: 0,
          }}
        >
          <SparklesIcon size={14} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}
          >
            Morning rundown
          </span>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            {data.headline}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-foreground)",
          }}
        >
          {data.model} · {data.duration} · {data.generatedAt}
        </span>
        <button
          type="button"
          aria-label="Regenerate briefing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background =
              "var(--accent)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          <RefreshCwIcon size={13} />
        </button>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.items.map((item) => (
          <BriefingItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
