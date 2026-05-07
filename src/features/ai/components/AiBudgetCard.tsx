// Settings → AI provider monthly budget card (per PRD #29 mockup #2).
//
// Pure presentational component. Renders $ used / $ cap, a percentage
// progress bar, and the fallback / hard-stop threshold rules.

import { Progress } from "#/components/coss/progress";

export type AiBudgetCardProps = {
  used: number;
  cap: number;
  fallbackPct: number;
  hardStopPct: number;
  fallbackModel?: string;
};

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AiBudgetCard({
  used,
  cap,
  fallbackPct,
  hardStopPct,
  fallbackModel = "claude-haiku-4-5",
}: AiBudgetCardProps) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <section
      aria-label="Monthly budget"
      className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="font-semibold text-base">Monthly budget</h3>
        <p className="font-mono text-sm">
          <span className="text-foreground">{formatUsd(used)}</span>
          <span className="text-muted-foreground"> / {formatUsd(cap)}</span>
        </p>
      </header>

      <div className="mt-4">
        <Progress value={pct} aria-label="Budget used" />
        <p className="mt-2 text-muted-foreground text-xs">{pct}% used</p>
      </div>

      <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Fallback at {fallbackPct}%</dt>
        <dd>
          → <code className="font-mono">{fallbackModel}</code>
        </dd>
        <dt className="text-muted-foreground">Hard stop at {hardStopPct}%</dt>
        <dd>Pause AI calls until next month</dd>
      </dl>
    </section>
  );
}
