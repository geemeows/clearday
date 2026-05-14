// Filter chip rail for the Inbox list header.

import type { InboxFilter, InboxSignal } from "#/features/signals/components/InboxView";

const FILTERS: Array<{ id: InboxFilter; label: string; source: string | null }> = [
  { id: "all", label: "All", source: null },
  { id: "prs", label: "PRs", source: "git" },
  { id: "tickets", label: "Tickets", source: "task" },
  { id: "mentions", label: "Mentions", source: "slack" },
  { id: "meetings", label: "Meetings", source: "cal" },
];

type Props = {
  signals: InboxSignal[];
  active: InboxFilter;
  onChange: (f: InboxFilter) => void;
};

export function SourceFilter({ signals, active, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {FILTERS.map((f) => {
        const count = f.source
          ? signals.filter((s) => s.source === f.source).length
          : signals.length;
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-pressed={isActive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              height: 28,
              padding: "0 10px",
              borderRadius: 999,
              border: isActive ? "none" : "1px solid var(--border)",
              background: isActive ? "var(--primary)" : "transparent",
              color: isActive
                ? "var(--primary-foreground)"
                : "var(--foreground)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.1s",
            }}
          >
            {f.label}
            <span
              style={{
                fontSize: 10.5,
                opacity: 0.7,
                fontWeight: 500,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
