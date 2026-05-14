// Collapsible sources rail in the sidebar — shows connected integrations
// with status dots and unread signal counts.

import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { SourceId } from "#/features/signals/components/SourceGlyph";
import { SOURCE_LABELS } from "#/features/signals/components/SourceGlyph";

type SourceStatus = "good" | "warn" | "bad";

type SourceEntry = {
  id: SourceId;
  name: string;
  status: SourceStatus;
  count: number;
};

type IntegrationRow = {
  provider: string;
  status?: string;
  [key: string]: unknown;
};

function providerToSourceId(provider: string): SourceId | null {
  const map: Record<string, SourceId> = {
    github: "git",
    slack: "slack",
    google: "cal",
    linear: "linear",
    jira: "jira",
  };
  return map[provider] ?? null;
}

function integrationStatus(status?: string): SourceStatus {
  if (status === "warn") return "warn";
  if (status === "error" || status === "bad") return "bad";
  return "good";
}

function StatusDot({ status }: { status: SourceStatus }) {
  const color =
    status === "good"
      ? "var(--success, #22c55e)"
      : status === "warn"
        ? "var(--warning, #f59e0b)"
        : "var(--danger, #ef4444)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        display: "inline-block",
      }}
      aria-hidden="true"
    />
  );
}

export function SourcesRail() {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<SourceEntry[]>([]);

  useEffect(() => {
    apiFetch("/api/integrations")
      .then((data) => {
        const resp = data as { integrations?: IntegrationRow[] };
        const rows = resp.integrations ?? [];
        const seen = new Set<SourceId>();
        const entries: SourceEntry[] = [];
        for (const row of rows) {
          const id = providerToSourceId(row.provider);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          entries.push({
            id,
            name: SOURCE_LABELS[id] ?? row.provider,
            status: integrationStatus(row.status as string | undefined),
            count: 0,
          });
        }
        setSources(entries);
      })
      .catch(() => {
        // Pre-auth or network error — show empty rail.
      });
  }, []);

  const badCount = sources.filter((s) => s.status === "bad").length;
  const warnCount = sources.filter((s) => s.status === "warn").length;
  const summaryDot: SourceStatus =
    badCount > 0 ? "bad" : warnCount > 0 ? "warn" : "good";
  const summaryLabel =
    sources.length === 0
      ? "no sources"
      : badCount > 0
        ? `${badCount} down`
        : warnCount > 0
          ? `${warnCount} warn`
          : `${sources.length} connected`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px",
          marginBottom: open ? 4 : 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted-foreground)",
          }}
        >
          Sources
        </span>
        <StatusDot status={summaryDot} />
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--muted-foreground)",
          }}
        >
          {summaryLabel}
        </span>
        {open ? (
          <ChevronDownIcon size={12} style={{ color: "var(--muted-foreground)" }} />
        ) : (
          <ChevronRightIcon size={12} style={{ color: "var(--muted-foreground)" }} />
        )}
      </button>

      {open && sources.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "5px 6px",
                borderRadius: 6,
              }}
            >
              <SourceGlyph source={s.id} size={16} />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  flex: 1,
                  color: "var(--foreground)",
                }}
              >
                {s.name}
              </span>
              {s.count > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--muted-foreground)",
                  }}
                >
                  {s.count}
                </span>
              )}
              <StatusDot status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
