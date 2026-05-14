// CriterionSection + CompetencyBlock — competency card with collapsible criteria tree.

import { PlusIcon } from "lucide-react";
import { IndicatorRow } from "./IndicatorRow";
import type { Competency, Criterion, CriterionSat, Indicator } from "./career-data";

// ── CriterionSection ──────────────────────────────────────────────────────────

export function CriterionSection({
  cr,
  letter,
  readOnly,
  sat,
  onAddEvidence,
  onRemoveEvidence,
  onScoreChange,
  onAddIndicator,
  onShowAllEvidence,
  onShowComments,
}: {
  cr: Criterion;
  letter: string;
  readOnly?: boolean;
  sat?: Record<string, CriterionSat>;
  onAddEvidence?: (ind: Indicator) => void;
  onRemoveEvidence?: (indId: string, evId: string) => void;
  onScoreChange?: (indId: string, score: number) => void;
  onAddIndicator?: (cr: Criterion) => void;
  onShowAllEvidence?: (ind: Indicator) => void;
  onShowComments?: (ind: Indicator) => void;
}) {
  const summary = sat?.[cr.id];

  return (
    <div className="mt-3.5">
      {/* criterion header */}
      <div
        className="flex items-baseline gap-2.5 px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--hairline-soft)" }}
      >
        <span
          className="inline-flex size-[18px] items-center justify-center rounded text-[11px] font-bold shrink-0"
          style={{
            background: "var(--surface-strong)",
            color: "var(--muted-foreground)",
          }}
        >
          {letter}
        </span>
        <span className="text-[13.5px] font-semibold text-foreground">
          {cr.name}
        </span>
        {summary && (
          <span
            className="font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded border"
            style={{
              color: "var(--muted-foreground)",
              background: "var(--surface-strong)",
              borderColor: "var(--hairline)",
            }}
          >
            {summary.avg.toFixed(1)}{" "}
            <span style={{ color: "var(--muted-soft)" }}>
              / {summary.target.toFixed(1)} target
            </span>
          </span>
        )}
        <span className="flex-1" />
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddIndicator?.(cr)}
            className="border-none bg-transparent text-[11.5px] cursor-pointer px-1.5 py-0.5 rounded inline-flex items-center gap-1"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "var(--accent)";
              el.style.color = "var(--foreground)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = "transparent";
              el.style.color = "var(--muted-foreground)";
            }}
          >
            <PlusIcon className="size-[11px]" /> Indicator
          </button>
        )}
      </div>

      {/* indicators */}
      <div>
        {cr.indicators.map((ind) => (
          <IndicatorRow
            key={ind.id}
            ind={ind}
            readOnly={readOnly}
            onScoreChange={onScoreChange}
            onAddEvidence={onAddEvidence}
            onRemoveEvidence={onRemoveEvidence}
            onShowAllEvidence={onShowAllEvidence}
            onShowComments={onShowComments}
          />
        ))}
        {!readOnly && cr.indicators.length === 0 && (
          <button
            type="button"
            onClick={() => onAddIndicator?.(cr)}
            className="w-full px-3.5 py-2.5 mt-1 rounded-sm border text-[12px] cursor-pointer inline-flex items-center justify-center gap-1.5"
            style={{
              background: "transparent",
              borderStyle: "dashed",
              borderColor: "var(--border-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            <PlusIcon className="size-3" /> Add the first indicator
          </button>
        )}
      </div>
    </div>
  );
}

// ── CompetencyBlock ───────────────────────────────────────────────────────────

export function CompetencyBlock({
  comp,
  readOnly,
  sat,
  onAddEvidence,
  onRemoveEvidence,
  onScoreChange,
  onAddCriterion,
  onAddIndicator,
  onShowAllEvidence,
  onShowComments,
}: {
  comp: Competency;
  readOnly?: boolean;
  sat?: Record<string, CriterionSat>;
  onAddEvidence?: (ind: Indicator) => void;
  onRemoveEvidence?: (indId: string, evId: string) => void;
  onScoreChange?: (indId: string, score: number) => void;
  onAddCriterion?: (comp: Competency) => void;
  onAddIndicator?: (cr: Criterion) => void;
  onShowAllEvidence?: (ind: Indicator) => void;
  onShowComments?: (ind: Indicator) => void;
}) {
  const indicatorCount = comp.criteria.reduce(
    (s, c) => s + c.indicators.length,
    0,
  );

  return (
    <section
      className="rounded-lg border mb-3.5 overflow-hidden"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
      }}
    >
      {/* header */}
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{
          borderBottom: "1px solid var(--hairline)",
          background:
            "linear-gradient(180deg, var(--surface-soft) 0%, var(--surface-card) 100%)",
        }}
      >
        <div
          className="size-[26px] rounded-md inline-flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
          aria-hidden
        >
          {comp.name[0]}
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold text-foreground">
            {comp.name}
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {comp.criteria.length} criteria · {indicatorCount} indicators
          </div>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddCriterion?.(comp)}
            className="border text-foreground text-[12px] cursor-pointer px-2.5 py-1 rounded-sm inline-flex items-center gap-1 font-medium"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "var(--primary)";
              el.style.color = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = "var(--border)";
              el.style.color = "var(--foreground)";
            }}
          >
            <PlusIcon className="size-3" /> Criterion
          </button>
        )}
      </header>

      {/* criteria */}
      <div className="px-1 pb-3.5">
        {comp.criteria.map((cr, i) => (
          <CriterionSection
            key={cr.id}
            cr={cr}
            letter={String.fromCharCode(65 + i)}
            readOnly={readOnly}
            sat={sat}
            onAddEvidence={onAddEvidence}
            onRemoveEvidence={onRemoveEvidence}
            onScoreChange={onScoreChange}
            onAddIndicator={onAddIndicator}
            onShowAllEvidence={onShowAllEvidence}
            onShowComments={onShowComments}
          />
        ))}
        {!readOnly && comp.criteria.length === 0 && (
          <button
            type="button"
            onClick={() => onAddCriterion?.(comp)}
            className="w-[calc(100%-8px)] mx-1 mt-3.5 px-3.5 py-3 rounded-md border cursor-pointer inline-flex items-center justify-center gap-1.5 text-[12.5px]"
            style={{
              background: "transparent",
              borderStyle: "dashed",
              borderColor: "var(--border-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            <PlusIcon className="size-3" /> Add the first criterion
          </button>
        )}
      </div>
    </section>
  );
}
