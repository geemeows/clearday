// Single event card rendered inside the 24-h timeline grid.
// Focus events fill solid with account color; meeting/personal events show an
// account-colored left stripe on a card background; break/personal events also
// render with reduced opacity (muted ink).

import type { CalEvent } from "./cal-event";
import { ROW_H, accountFor, fmtCalHour } from "./cal-event";

type ConflictSlot = { col: number; of: number };

type Props = {
  event: CalEvent;
  /** Lane assignment from buildConflictLayout; absent means full-width. */
  conflictSlot?: ConflictSlot;
  onClick?: () => void;
};

export function EventBlock({ event: e, conflictSlot, onClick }: Props) {
  const acc = accountFor(e.account);
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
          "repeating-linear-gradient(45deg, rgba(220,38,38,0.15) 0 6px, transparent 6px 10px)",
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
        background: isFocus ? acc.color : "var(--surface-card)",
        color: isFocus
          ? "white"
          : isMuted
            ? "var(--muted-foreground)"
            : "var(--foreground)",
        border: isFocus ? "none" : `1px solid ${acc.color}`,
        opacity: isMuted ? 0.65 : 1,
        boxShadow: isFocus ? "0 1px 2px rgba(0,0,0,.08)" : "none",
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

      {/* Account color stripe for non-focus events */}
      {!isFocus && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: acc.color,
            borderRadius: "8px 0 0 8px",
          }}
        />
      )}

      <span
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingLeft: isFocus ? 0 : 4,
          paddingRight: hasConflict ? 56 : 0,
        }}
      >
        {e.title}
      </span>

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          opacity: 0.75,
          marginTop: "auto",
          paddingLeft: isFocus ? 0 : 4,
        }}
      >
        {fmtCalHour(e.start)}–{fmtCalHour(e.end)}
      </span>
    </button>
  );
}
