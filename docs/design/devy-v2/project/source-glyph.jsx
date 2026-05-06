// Source glyphs — original geometric monograms, NOT brand logo recreations.
// Each provider gets a tinted square with a unique abstract shape + initial.

const SourceGlyph = ({ source, size = 22 }) => {
  const cfg = {
    git:    { bg: "var(--src-git-bg)",    fg: "var(--src-git)",    label: "G",  shape: "octagon" },
    slack:  { bg: "var(--src-slack-bg)",  fg: "var(--src-slack)",  label: "S",  shape: "diamond" },
    cal:    { bg: "var(--src-cal-bg)",    fg: "var(--src-cal)",    label: "C",  shape: "circle" },
    task:   { bg: "var(--src-task-bg)",   fg: "var(--src-task)",   label: "T",  shape: "square" },
    ai:     { bg: "var(--src-ai-bg)",     fg: "var(--src-ai)",     label: "✦", shape: "spark" },
  }[source] || { bg: "var(--surface-strong)", fg: "var(--ink)", label: "?", shape: "circle" };

  const radius = cfg.shape === "circle" ? "50%" :
                 cfg.shape === "diamond" ? "4px" :
                 cfg.shape === "octagon" ? "30%" :
                 "5px";

  const transform = cfg.shape === "diamond" ? "rotate(45deg)" : "none";

  return (
    <div
      style={{
        width: size, height: size,
        background: cfg.bg, color: cfg.fg,
        borderRadius: radius,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        fontSize: size * 0.55, fontWeight: 700, fontFamily: "var(--font-mono)",
        transform,
      }}
    >
      <span style={{ transform: cfg.shape === "diamond" ? "rotate(-45deg)" : "none" }}>
        {cfg.label}
      </span>
    </div>
  );
};

const SourceLabel = ({ source }) => {
  const labels = { git: "GitHub", slack: "Slack", cal: "Calendar", task: "Linear", ai: "AI" };
  return labels[source] || source;
};

window.SourceGlyph = SourceGlyph;
window.SourceLabel = SourceLabel;
