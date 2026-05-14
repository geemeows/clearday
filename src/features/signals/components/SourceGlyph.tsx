// Brand-mark glyphs for each signal source provider.
// Matches the source-glyph.jsx design reference in docs/design/devy-unbundled/.

const BRAND_PATHS: Record<string, { viewBox: string; paths: string[] }> = {
  git: {
    viewBox: "0 0 24 24",
    paths: [
      "M12 .5C5.65.5.5 5.65.5 12.02c0 5.1 3.29 9.42 7.86 10.95.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.95-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.66.79.55C20.21 21.43 23.5 17.11 23.5 12c0-6.36-5.15-11.5-11.5-11.5z",
    ],
  },
  slack: {
    viewBox: "0 0 24 24",
    paths: [
      "M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52zM6.31 15.16a2.52 2.52 0 1 1 5.04 0v6.32a2.52 2.52 0 1 1-5.04 0v-6.32z",
      "M8.83 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83zM8.83 6.31a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.31z",
      "M18.96 8.83a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.83zM17.69 8.83a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.31z",
      "M15.17 18.96a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52zM15.17 17.69a2.52 2.52 0 1 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31z",
    ],
  },
  cal: {
    viewBox: "0 0 24 24",
    paths: [
      "M4.5 3.5h15a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-15A1.5 1.5 0 0 1 4.5 3.5zm0 5h15v11.5h-15V8.5zm2.25-3.25h2.5v3h-2.5v-3zm8 0h2.5v3h-2.5v-3z",
      "M9.05 12.45c.4-.46.99-.79 1.7-.79 1.04 0 1.86.62 1.86 1.49 0 .57-.34 1.05-.91 1.27v.04c.66.18 1.07.69 1.07 1.39 0 1-.91 1.66-2.04 1.66-.85 0-1.55-.39-1.86-.98l.83-.42c.18.34.55.55 1.02.55.55 0 .96-.28.96-.79 0-.48-.36-.78-.96-.78h-.4v-.86h.39c.5 0 .82-.27.82-.7 0-.39-.31-.66-.81-.66-.39 0-.7.18-.85.47l-.82-.49zm5.07 4.95v-4.18l-.97.69-.47-.74 1.6-1.13h.85v5.36h-1.01z",
    ],
  },
  linear: {
    viewBox: "0 0 24 24",
    paths: [
      "M3.945 8.789a4.97 4.97 0 0 1 1.395-1.992L17.203 18.66a4.97 4.97 0 0 1-1.992 1.395L3.945 8.789zM2.85 12c0-.504.038-1.001.111-1.484l10.523 10.523a8 8 0 0 1-1.484.111C7.946 21.15 2.85 17.054 2.85 12zM12 2.85c.504 0 1.001.038 1.484.111L2.961 13.484C2.888 13.001 2.85 12.504 2.85 12 2.85 6.946 6.946 2.85 12 2.85zm9.15 9.15c0 5.054-4.096 9.15-9.15 9.15a8.0 8.0 0 0 1-1.484-.111L21.039 10.516c.073.483.111.98.111 1.484z",
    ],
  },
  jira: {
    viewBox: "0 0 24 24",
    paths: [
      "M11.53 2H22c0 5.79-4.69 10.48-10.48 10.48H7.34v3.13a5.34 5.34 0 0 0 5.34 5.34V22a8.46 8.46 0 0 1-8.46-8.46V12.05a1.04 1.04 0 0 1 1.04-1.04h6.27V7.34A5.34 5.34 0 0 0 6.19 2h5.34z",
    ],
  },
  task: {
    viewBox: "0 0 24 24",
    paths: [
      "M3.07 14.83a.5.5 0 0 1 .14-.45l11.41-11.41a.5.5 0 0 1 .45-.14 9.5 9.5 0 0 1 6.5 6.5.5.5 0 0 1-.14.45L9.42 21.18a.5.5 0 0 1-.45.14 9.5 9.5 0 0 1-5.9-6.49z",
      "M3 11.84a9.5 9.5 0 0 1 .35-2.55.5.5 0 0 1 .84-.21l9.74 9.74a.5.5 0 0 1-.21.84A9.5 9.5 0 0 1 3 11.84z",
      "M4.42 6.6a.5.5 0 0 1 .76-.65l13.87 13.87a.5.5 0 0 1-.65.76A9.5 9.5 0 0 1 4.42 6.6z",
      "M21 12.16a9.5 9.5 0 0 1-.35 2.55.5.5 0 0 1-.84.21L10.07 5.18a.5.5 0 0 1 .21-.84A9.5 9.5 0 0 1 21 12.16z",
    ],
  },
};

const SOURCE_CONFIG: Record<
  string,
  { bg: string; fg: string; brand: string }
> = {
  git: { bg: "var(--src-git-bg)", fg: "var(--src-git)", brand: "git" },
  slack: {
    bg: "var(--src-slack-bg)",
    fg: "var(--src-slack)",
    brand: "slack",
  },
  cal: { bg: "var(--src-cal-bg)", fg: "var(--src-cal)", brand: "cal" },
  task: {
    bg: "var(--src-task-bg)",
    fg: "var(--src-task)",
    brand: "linear",
  },
  linear: {
    bg: "var(--src-task-bg)",
    fg: "var(--src-task)",
    brand: "linear",
  },
  jira: {
    bg: "var(--src-jira-bg, #DEEBFF)",
    fg: "var(--src-jira, #2684FF)",
    brand: "jira",
  },
};

export type SourceId = "git" | "slack" | "cal" | "task" | "linear" | "jira" | "ai";

export function SourceGlyph({
  source,
  size = 22,
}: {
  source: SourceId | string;
  size?: number;
}) {
  if (source === "ai") {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: "var(--src-ai-bg)",
          color: "var(--src-ai)",
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: size * 0.6,
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        ✦
      </div>
    );
  }

  const cfg = SOURCE_CONFIG[source];
  if (!cfg) {
    return (
      <div
        style={{
          width: size,
          height: size,
          background: "var(--surface-strong)",
          color: "var(--ink)",
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: size * 0.55,
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        ?
      </div>
    );
  }

  const brand = BRAND_PATHS[cfg.brand];
  const pad = Math.max(2, Math.round(size * 0.18));
  return (
    <div
      style={{
        width: size,
        height: size,
        background: cfg.bg,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <svg
        width={size - pad}
        height={size - pad}
        viewBox={brand.viewBox}
        fill={cfg.fg}
        aria-hidden="true"
      >
        {brand.paths.map((d) => (
          <path key={d.slice(0, 8)} d={d} />
        ))}
      </svg>
    </div>
  );
}

export const SOURCE_LABELS: Record<SourceId | "ai", string> = {
  git: "GitHub",
  slack: "Slack",
  cal: "Calendar",
  task: "Linear",
  linear: "Linear",
  jira: "Jira",
  ai: "AI",
};
