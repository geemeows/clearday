// CareerEmpty — shown when no career level exists yet.

import { InfoIcon, TargetIcon } from "lucide-react";

export function CareerEmpty({
  onSeed,
  onBlank,
}: {
  onSeed?: () => void;
  onBlank?: () => void;
}) {
  return (
    <div
      className="max-w-[720px] mx-auto mt-12 p-6 rounded-lg border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="size-12 rounded-[10px] inline-flex items-center justify-center mb-3"
        style={{
          background: "var(--accent-tint)",
          color: "var(--primary)",
        }}
      >
        <TargetIcon className="size-[22px]" />
      </div>
      <div
        className="text-[22px] font-bold tracking-[-0.4px] text-foreground"
      >
        Track your career — in the same place you do everything else.
      </div>
      <div
        className="mt-1.5 text-[13.5px] max-w-[540px]"
        style={{ color: "var(--body)" }}
      >
        Build a tree of competencies, criteria, and indicators. Score yourself,
        attach evidence, and push a polished snapshot to a Google Sheet when
        it's time to share.
      </div>
      <div
        className="grid gap-3 mt-4.5"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <button
          type="button"
          onClick={onSeed}
          className="text-left p-4 rounded-md border cursor-pointer"
          style={{
            background: "var(--surface-soft)",
            borderColor: "var(--border)",
          }}
        >
          <div className="inline-flex items-center gap-2 mb-2">
            <span
              className="px-1.5 py-0.5 rounded-full text-[10.5px] font-bold"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              RECOMMENDED
            </span>
          </div>
          <div className="text-[14px] font-semibold text-foreground">
            Start from the Senior Engineer template
          </div>
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            5 competencies, 11 criteria, 24 indicators — pre-shaped, no scores.
          </div>
        </button>
        <button
          type="button"
          onClick={onBlank}
          className="text-left p-4 rounded-md border cursor-pointer"
          style={{
            background: "transparent",
            borderStyle: "dashed",
            borderColor: "var(--border-strong)",
          }}
        >
          <div className="text-[14px] font-semibold text-foreground">
            Start blank
          </div>
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            One competency, no criteria. Build it from scratch.
          </div>
        </button>
      </div>
      <div
        className="mt-4.5 px-3 py-2.5 rounded-md border flex items-center gap-2 text-[12px]"
        style={{
          background: "var(--surface-strong)",
          borderColor: "var(--hairline)",
          color: "var(--muted-foreground)",
        }}
      >
        <InfoIcon className="size-3 shrink-0" /> Your data is private to your
        deployment — same RLS as Projects and Inbox.
      </div>
    </div>
  );
}
