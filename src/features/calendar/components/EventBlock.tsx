// Single event card rendered inside the 24-h timeline grid.
// All events render as filled chips whose background comes from
// account-color.ts (replaces the old left-stripe-only treatment).
// Focus events are fully opaque; meeting/personal events render at
// reduced opacity so focus blocks stand out.

import { accountColor } from "#/features/calendar/account-color";
import type { CalEvent } from "./cal-event";
import { ROW_H, fmtCalHour } from "./cal-event";

type ConflictSlot = { col: number; of: number };

type Props = {
  event: CalEvent;
  /** Lane assignment from buildConflictLayout; absent means full-width. */
  conflictSlot?: ConflictSlot;
  onClick?: () => void;
};

export function EventBlock({ event: e, conflictSlot, onClick }: Props) {
  const { background, foreground } = accountColor(e.account);
  const isFocus = e.kind === "focus";
  const isMuted = e.kind === "break" || e.kind === "personal";
  const hasConflict = conflictSlot !== undefined && conflictSlot.of > 1;

  const top = e.start * ROW_H;
  const height = Math.max(20, (e.end - e.start) * ROW_H - 2);

  const leftVal = hasConflict
    ? `calc(${(100 / conflictSlot.of) * conflictSlot.col}% + 4px)`
    : "4px";
  const widthVal = hasConflict
    ? `calc(${100 / conflictSlot.of}% - 8px)`
    : "calc(100% - 8px)";

  const conflictStyle = hasConflict
    ? {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(220,38,38,0.20) 0 6px, transparent 6px 10px)",
        outline: "1.5px solid var(--destructive)",
        outlineOffset: -1,
      }
    : {};

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={e.title}
      data-kind={e.kind}
      data-testid="event-block"
      style={{
        position: "absolute",
        top: top + 1,
        left: leftVal,
        width: widthVal,
        height,
        borderRadius: 8,
        padding: "5px 8px",
        background,
        color: foreground,
        border: "none",
        opacity: isMuted ? 0.65 : isFocus ? 1 : 0.85,
        boxShadow: "0 1px 2px rgba(0,0,0,.10)",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...conflictStyle,
      }}
    >
      {/* Conflict badge */}
      {hasConflict && (
        <span
          data-testid="conflict-pill"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            padding: "1px 5px",
            borderRadius: 3,
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            background: "var(--destructive)",
            color: "white",
            lineHeight: 1,
          }}
        >
          Conflict {conflictSlot.col + 1}/{conflictSlot.of}
        </span>
      )}

      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingRight: hasConflict ? 56 : 0,
        }}
      >
        {e.title}
      </span>

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          opacity: 0.8,
          marginTop: "auto",
        }}
      >
        {fmtCalHour(e.start)}–{fmtCalHour(e.end)}
      </span>
    </button>
  );
}
