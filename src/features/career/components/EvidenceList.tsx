// EvidenceChip + EvidenceList — collapsible evidence chips for an indicator.

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  Link2Icon,
  PaperclipIcon,
  PlusIcon,
  QuoteIcon,
  XIcon,
} from "lucide-react";
import type { Evidence } from "./career-data";

function EvidenceIcon({ ev }: { ev: Evidence }) {
  if (ev.kind === "text") return <QuoteIcon className="size-[11px]" />;
  if (ev.card_id) return <LayoutGridIcon className="size-[11px]" />;
  return <Link2Icon className="size-[11px]" />;
}

export function EvidenceChip({
  ev,
  readOnly,
  onRemove,
}: {
  ev: Evidence;
  readOnly?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11.5px] font-medium text-foreground max-w-[280px]"
      style={{
        background:
          ev.kind === "text"
            ? "var(--surface-soft)"
            : "var(--surface-strong)",
        borderColor: "var(--hairline)",
      }}
      title={ev.title}
    >
      <EvidenceIcon ev={ev} />
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ fontStyle: ev.kind === "text" ? "italic" : "normal" }}
      >
        {ev.kind === "text" ? `"${ev.title}"` : ev.title}
      </span>
      {!readOnly && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="size-[14px] border-none bg-transparent text-muted-foreground cursor-pointer p-0 inline-flex items-center justify-center rounded-full"
          aria-label="Remove evidence"
          type="button"
        >
          <XIcon className="size-[10px]" />
        </button>
      )}
    </span>
  );
}

export function EvidenceList({
  items,
  readOnly,
  onRemove,
  onShowAll,
}: {
  items: Evidence[];
  readOnly?: boolean;
  onRemove?: (evId: string) => void;
  onShowAll?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11.5px] font-semibold cursor-pointer"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
        title="Show evidence"
        type="button"
      >
        <PaperclipIcon className="size-[11px]" />
        {items.length} evidence
        <ChevronRightIcon
          className="size-[11px]"
          style={{ color: "var(--muted-foreground)" }}
        />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11.5px] font-semibold cursor-pointer"
        style={{
          background: "var(--accent-tint)",
          borderColor: "var(--primary)",
          color: "var(--primary)",
        }}
        title="Collapse evidence"
        type="button"
      >
        <PaperclipIcon className="size-[11px]" />
        {items.length} evidence
        <ChevronDownIcon className="size-[11px]" />
      </button>
      {items.map((ev) => (
        <EvidenceChip
          key={ev.id}
          ev={ev}
          readOnly={readOnly}
          onRemove={() => onRemove?.(ev.id)}
        />
      ))}
      {onShowAll && items.length > 4 && (
        <button
          onClick={onShowAll}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11.5px] font-medium cursor-pointer"
          style={{
            background: "transparent",
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
          type="button"
        >
          Manage all
        </button>
      )}
    </>
  );
}

export function AddEvidenceButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] cursor-pointer"
      style={{
        background: "transparent",
        border: "1px dashed var(--border-strong)",
        color: "var(--muted-foreground)",
      }}
      type="button"
    >
      <PlusIcon className="size-[11px]" /> Evidence
    </button>
  );
}
