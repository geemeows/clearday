import { cn } from "#/lib/cn";

export type SourceKind = "git" | "slack" | "cal" | "task" | "ai";

const LABELS: Record<SourceKind, string> = {
  git: "Git source",
  slack: "Slack source",
  cal: "Calendar source",
  task: "Task source",
  ai: "AI source",
};

const TILE_TINT: Record<SourceKind, string> = {
  // Soft tints — abstract glyphs, no brand recreation.
  git: "bg-zinc-100 text-zinc-700",
  slack: "bg-violet-100 text-violet-700",
  cal: "bg-sky-100 text-sky-700",
  task: "bg-amber-100 text-amber-700",
  ai: "bg-rose-100 text-rose-700",
};

type Props = {
  source: SourceKind;
  size?: number;
  className?: string;
};

export function SourceGlyph({ source, size = 24, className }: Props) {
  const inner = Math.max(8, Math.floor(size * 0.55));
  return (
    <span
      role="img"
      aria-label={LABELS[source]}
      data-source={source}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md",
        TILE_TINT[source],
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Glyph kind={source} size={inner} />
    </span>
  );
}

function Glyph({ kind, size }: { kind: SourceKind; size: number }) {
  const paths = (() => {
    switch (kind) {
      case "git":
        return (
          <>
            <circle cx="4" cy="4" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <path d="M4 5.5v5" />
            <path d="M4 8h5.5a2 2 0 0 1 2 2v0" />
          </>
        );
      case "slack":
        return (
          <>
            <rect x="3" y="3" width="3" height="10" rx="1.5" />
            <rect x="10" y="3" width="3" height="10" rx="1.5" />
            <rect x="3" y="3" width="10" height="3" rx="1.5" />
            <rect x="3" y="10" width="10" height="3" rx="1.5" />
          </>
        );
      case "cal":
        return (
          <>
            <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
            <path d="M2.5 6.5h11" />
            <path d="M5.5 2v3" />
            <path d="M10.5 2v3" />
          </>
        );
      case "task":
        return (
          <>
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
            <path d="M5 8.5l2 2 4-5" />
          </>
        );
      case "ai":
        return <path d="M8 2l1.5 4 4 1.5-4 1.5L8 13l-1.5-4-4-1.5 4-1.5L8 2z" />;
    }
  })();
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}
