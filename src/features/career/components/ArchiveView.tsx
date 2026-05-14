// ArchiveView — grid of archived level cards + archive-detail banner.

import { ArchiveIcon, CopyIcon, ExternalLinkIcon, EyeIcon, XIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { CompetencyBlock } from "./CompetencyBlock";
import { WheelPanel } from "./WheelPanel";
import type { ArchivedLevel, Competency, WheelDataPoint } from "./career-data";

// ── ArchiveGrid ────────────────────────────────────────────────────────────────

export function ArchiveGrid({
  levels,
  onOpen,
  onClone,
}: {
  levels: ArchivedLevel[];
  onOpen?: (l: ArchivedLevel) => void;
  onClone?: (l: ArchivedLevel) => void;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {levels.map((l) => (
        <div
          key={l.id}
          className="relative p-3.5 rounded-lg border"
          style={{
            background: "var(--surface-card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
              style={{
                background: "var(--surface-strong)",
                color: "var(--muted-foreground)",
              }}
            >
              Archived
            </span>
            <span
              className="text-[11.5px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {l.archived_at}
            </span>
          </div>
          <div className="text-[15.5px] font-bold tracking-[-0.2px] text-foreground">
            {l.title}
          </div>
          <div
            className="text-[11.5px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Started {l.created_at}
          </div>
          <div
            className="grid gap-1 mt-3 py-2"
            style={{
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid var(--hairline-soft)",
              borderBottom: "1px solid var(--hairline-soft)",
            }}
          >
            {(
              [
                ["Comp.", l.summary.competencies],
                ["Crit.", l.summary.criteria],
                ["Ind.", l.summary.indicators],
                ["Avg", l.summary.current_avg.toFixed(1)],
              ] as [string, string | number][]
            ).map(([k, v]) => (
              <div key={k} className="text-center">
                <div className="font-mono text-[14px] font-bold text-foreground">
                  {v}
                </div>
                <div
                  className="text-[10.5px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {k}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpen?.(l)}
            >
              <EyeIcon /> Open
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onClone?.(l)}
            >
              <CopyIcon /> Clone as template
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ArchiveDetailBanner ────────────────────────────────────────────────────────

export function ArchiveDetailBanner({
  level,
  onClose,
}: {
  level: ArchivedLevel;
  onClose?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-md border text-[12.5px] mb-3"
      style={{
        background: "var(--surface-strong)",
        borderColor: "var(--border)",
      }}
    >
      <ArchiveIcon className="size-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
      <span className="text-foreground">
        <b>{level.title}</b>
        <span style={{ color: "var(--muted-foreground)" }}>
          {" "}· read-only snapshot · archived {level.archived_at}
        </span>
      </span>
      <span className="flex-1" />
      <Button variant="outline" size="sm">
        <CopyIcon /> Clone as template
      </Button>
      <Button variant="outline" size="sm">
        <ExternalLinkIcon /> Open sheet
      </Button>
      <Button variant="outline" size="sm" onClick={onClose}>
        <XIcon /> Close
      </Button>
    </div>
  );
}

// ── ArchiveDetailView ──────────────────────────────────────────────────────────

export function ArchiveDetailView({
  level: archived,
  competencies,
  criteriaData,
  satPerCriterion,
}: {
  level: ArchivedLevel;
  competencies: Competency[];
  criteriaData: WheelDataPoint[];
  satPerCriterion: Record<string, { avg: number; target: number; gap: number }>;
}) {
  return (
    <div className="mt-4.5">
      <ArchiveDetailBanner level={archived} />
      <div
        className="grid gap-4.5 items-start"
        style={{ gridTemplateColumns: "1.6fr 1fr" }}
      >
        <div>
          {competencies.map((c) => (
            <CompetencyBlock
              key={c.id}
              comp={c}
              readOnly
              sat={satPerCriterion}
            />
          ))}
        </div>
        <WheelPanel criteria={criteriaData} competencies={competencies} />
      </div>
    </div>
  );
}
