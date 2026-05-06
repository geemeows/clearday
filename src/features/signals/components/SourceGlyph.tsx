import { cn } from "#/lib/cn";

export type SourceKind = "git" | "slack" | "cal" | "task" | "ai";

const LABELS: Record<SourceKind, string> = {
  git: "Git source",
  slack: "Slack source",
  cal: "Calendar source",
  task: "Task source",
  ai: "AI source",
};

type GlyphCfg = {
  bg: string;
  fg: string;
  label: string;
  shape: "circle" | "diamond" | "octagon" | "square" | "spark";
};

const CFG: Record<SourceKind, GlyphCfg> = {
  git: {
    bg: "var(--src-git-bg)",
    fg: "var(--src-git)",
    label: "G",
    shape: "octagon",
  },
  slack: {
    bg: "var(--src-slack-bg)",
    fg: "var(--src-slack)",
    label: "S",
    shape: "diamond",
  },
  cal: {
    bg: "var(--src-cal-bg)",
    fg: "var(--src-cal)",
    label: "C",
    shape: "circle",
  },
  task: {
    bg: "var(--src-task-bg)",
    fg: "var(--src-task)",
    label: "T",
    shape: "square",
  },
  ai: {
    bg: "var(--src-ai-bg)",
    fg: "var(--src-ai)",
    label: "✦",
    shape: "spark",
  },
};

function radiusFor(shape: GlyphCfg["shape"]): string {
  if (shape === "circle") return "50%";
  if (shape === "diamond") return "4px";
  if (shape === "octagon") return "30%";
  return "5px";
}

type Props = {
  source: SourceKind;
  size?: number;
  className?: string;
};

export function SourceGlyph({ source, size = 22, className }: Props) {
  const cfg = CFG[source];
  const transform = cfg.shape === "diamond" ? "rotate(45deg)" : undefined;
  const inverse = cfg.shape === "diamond" ? "rotate(-45deg)" : undefined;
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
        color: cfg.fg,
        borderRadius: radiusFor(cfg.shape),
        fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
        fontWeight: 700,
        fontSize: size * 0.55,
        transform,
      }}
    >
      <span style={{ transform: inverse, lineHeight: 1 }}>{cfg.label}</span>
    </span>
  );
}
