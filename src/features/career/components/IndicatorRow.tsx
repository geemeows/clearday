// IndicatorRow — single observable behaviour with code, description, score, evidence.

import { GripVerticalIcon, MessageCircleIcon } from "lucide-react";
import { AddEvidenceButton, EvidenceList } from "./EvidenceList";
import { ScoreDots } from "./ScoreDots";
import type { Indicator } from "./career-data";

export function IndicatorRow({
  ind,
  readOnly,
  onScoreChange,
  onAddEvidence,
  onRemoveEvidence,
  onShowAllEvidence,
  onShowComments,
}: {
  ind: Indicator;
  readOnly?: boolean;
  onScoreChange?: (indId: string, score: number) => void;
  onAddEvidence?: (ind: Indicator) => void;
  onRemoveEvidence?: (indId: string, evId: string) => void;
  onShowAllEvidence?: (ind: Indicator) => void;
  onShowComments?: (ind: Indicator) => void;
}) {
  const comments = ind.comments ?? [];

  return (
    <div
      className="grid gap-3.5 px-3.5 py-2.5 items-start"
      style={{
        gridTemplateColumns: "auto 1fr auto",
        borderTop: "1px solid var(--hairline-soft)",
      }}
    >
      {/* left: drag handle + code */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {!readOnly && (
          <button
            type="button"
            title="Drag to reorder"
            className="size-4 p-0 border-none bg-transparent text-[var(--muted-soft)] cursor-grab opacity-70"
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
        )}
        <span
          className="font-mono px-1.5 py-0.5 rounded text-[11px] font-semibold tracking-wide"
          style={{
            background: "var(--surface-strong)",
            color: "var(--muted-foreground)",
          }}
        >
          {ind.code}
        </span>
      </div>

      {/* center: description + evidence row */}
      <div className="min-w-0">
        <p className="text-[13px] text-foreground leading-snug m-0" style={{ textWrap: "pretty" }}>
          {ind.description}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
          <EvidenceList
            items={ind.evidence}
            readOnly={readOnly}
            onRemove={(evId) => onRemoveEvidence?.(ind.id, evId)}
            onShowAll={() => onShowAllEvidence?.(ind)}
          />
          {!readOnly && (
            <AddEvidenceButton onClick={() => onAddEvidence?.(ind)} />
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onShowComments?.(ind)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] cursor-pointer"
              style={{
                background: "transparent",
                border: "1px solid transparent",
                color: "var(--muted-foreground)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "transparent";
              }}
            >
              <MessageCircleIcon className="size-[11px]" />
              {comments.length > 0
                ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
                : "Comment"}
            </button>
          )}
          {ind.notes && (
            <span
              className="text-[11.5px] ml-0.5 italic"
              style={{ color: "var(--muted-foreground)" }}
            >
              — {ind.notes}
            </span>
          )}
        </div>
      </div>

      {/* right: score dots */}
      <div className="pt-0.5">
        <ScoreDots
          value={ind.score}
          target={ind.target}
          onChange={(v) => onScoreChange?.(ind.id, v)}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
