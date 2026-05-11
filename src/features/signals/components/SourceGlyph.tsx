import { cn } from "#/lib/cn";

// Inbox/Today previews refer to a Linear ticket as "task" (legacy kind name).
// The Projects page card-link picker passes "linear" / "jira" through from the
// mockup data shape. Both surface as the Linear brand glyph; jira gets its own.
export type SourceKind =
  | "git"
  | "slack"
  | "cal"
  | "task"
  | "linear"
  | "jira"
  | "ai";

const LABELS: Record<SourceKind, string> = {
  git: "Git source",
  slack: "Slack source",
  cal: "Calendar source",
  task: "Task source",
  linear: "Linear source",
  jira: "Jira source",
  ai: "AI source",
};

type BrandKey = "git" | "slack" | "cal" | "linear" | "jira";

// Simplified brand SVG marks (simple-icons style) per
// docs/design/devy-ui/source-glyph.jsx. Drawn as monochrome paths coloured
// per-source via the --src-* tokens.
const BRANDS: Record<BrandKey, { viewBox: string; paths: string[] }> = {
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
      "M19.5 3H18V1.5a.75.75 0 0 0-1.5 0V3h-9V1.5a.75.75 0 0 0-1.5 0V3H4.5A1.5 1.5 0 0 0 3 4.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3zM19.5 19.5h-15V9h15v10.5zM19.5 7.5h-15V4.5H6V6a.75.75 0 0 0 1.5 0V4.5h9V6a.75.75 0 0 0 1.5 0V4.5h1.5v3z",
      "M11.25 13.5a1.5 1.5 0 1 1 1.78 1.47v.78a.75.75 0 0 0 1.5 0v-.78a3 3 0 1 0-3.78-3.47.75.75 0 1 0 1.46.34c.05-.2.16-.36.31-.47a.75.75 0 0 1 1.23.58c0 .41-.34.75-.75.75a.75.75 0 0 0-.75.75z",
    ],
  },
  linear: {
    viewBox: "0 0 24 24",
    paths: [
      "M3.07 14.83a.5.5 0 0 1 .14-.45l11.41-11.41a.5.5 0 0 1 .45-.14 9.5 9.5 0 0 1 6.5 6.5.5.5 0 0 1-.14.45L9.42 21.18a.5.5 0 0 1-.45.14 9.5 9.5 0 0 1-5.9-6.49z",
      "M3 11.84a9.5 9.5 0 0 1 .35-2.55.5.5 0 0 1 .84-.21l9.74 9.74a.5.5 0 0 1-.21.84A9.5 9.5 0 0 1 3 11.84z",
      "M4.42 6.6a.5.5 0 0 1 .76-.65l13.87 13.87a.5.5 0 0 1-.65.76A9.5 9.5 0 0 1 4.42 6.6z",
      "M21 12.16a9.5 9.5 0 0 1-.35 2.55.5.5 0 0 1-.84.21L10.07 5.18a.5.5 0 0 1 .21-.84A9.5 9.5 0 0 1 21 12.16z",
    ],
  },
  jira: {
    viewBox: "0 0 24 24",
    paths: [
      "M11.53 2H22c0 5.79-4.69 10.48-10.48 10.48H7.34v3.13a5.34 5.34 0 0 0 5.34 5.34V22a8.46 8.46 0 0 1-8.46-8.46V12.05a1.04 1.04 0 0 1 1.04-1.04h6.27V7.34A5.34 5.34 0 0 0 6.19 2h5.34z",
    ],
  },
};

type GlyphCfg = {
  bg: string;
  fg: string;
  brand: BrandKey;
};

const CFG: Record<Exclude<SourceKind, "ai">, GlyphCfg> = {
  git: { bg: "var(--src-git-bg)", fg: "var(--src-git)", brand: "git" },
  slack: { bg: "var(--src-slack-bg)", fg: "var(--src-slack)", brand: "slack" },
  cal: { bg: "var(--src-cal-bg)", fg: "var(--src-cal)", brand: "cal" },
  task: { bg: "var(--src-task-bg)", fg: "var(--src-task)", brand: "linear" },
  linear: { bg: "var(--src-task-bg)", fg: "var(--src-task)", brand: "linear" },
  jira: {
    bg: "var(--src-jira-bg, #DEEBFF)",
    fg: "var(--src-jira, #2684FF)",
    brand: "jira",
  },
};

type Props = {
  source: SourceKind;
  size?: number;
  className?: string;
};

export function SourceGlyph({ source, size = 22, className }: Props) {
  // AI keeps its sparkle — it's not a third-party brand.
  if (source === "ai") {
    return (
      <span
        role="img"
        aria-label={LABELS.ai}
        data-source="ai"
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "var(--src-ai-bg)",
          color: "var(--src-ai)",
          borderRadius: 6,
          fontWeight: 700,
          fontSize: size * 0.6,
          lineHeight: 1,
        }}
      >
        ✦
      </span>
    );
  }

  const cfg = CFG[source];
  const brand = BRANDS[cfg.brand];
  const pad = Math.max(2, Math.round(size * 0.18));
  return (
    <span
      role="img"
      aria-label={LABELS[source]}
      data-source={source}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: cfg.bg,
        borderRadius: 6,
      }}
    >
      <svg
        width={size - pad}
        height={size - pad}
        viewBox={brand.viewBox}
        fill={cfg.fg}
        aria-hidden="true"
      >
        {brand.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}
