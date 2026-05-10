import type React from "react";
import { cn } from "#/lib/cn";

export type StatusBadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "info";

const TONE_STYLE: Record<StatusBadgeTone, React.CSSProperties> = {
  success: { background: "var(--good-soft)", color: "var(--good)" },
  warning: { background: "var(--warn-soft)", color: "var(--warn)" },
  danger: { background: "var(--danger-soft)", color: "var(--destructive)" },
  muted: {
    background: "var(--surface-strong)",
    color: "var(--muted-foreground)",
  },
  info: { background: "var(--src-ai-bg)", color: "var(--src-ai)" },
};

export function StatusBadge({
  tone,
  className,
  children,
  title,
  ...rest
}: {
  tone: StatusBadgeTone;
  className?: string;
  children: React.ReactNode;
  title?: string;
} & Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "title" | "children"
>): React.ReactElement {
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      title={title}
      className={cn(
        "shrink-0 rounded-full px-[7px] py-px font-bold uppercase tracking-wide",
        className,
      )}
      style={{ fontSize: 10, lineHeight: 1.4, ...TONE_STYLE[tone] }}
      {...rest}
    >
      {children}
    </span>
  );
}
