import type React from "react";
import { cn } from "#/lib/cn";

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 20, md: 24, lg: 32 };
const FONT_PX: Record<Size, number> = { sm: 10, md: 10, lg: 12 };

const TINT_PALETTE = [
  "var(--src-git-bg)",
  "var(--src-slack-bg)",
  "var(--src-cal-bg)",
  "var(--src-task-bg)",
  "var(--src-ai-bg)",
];

function hashTint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TINT_PALETTE[Math.abs(h) % TINT_PALETTE.length];
}

function computeInitials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
}

export function UserAvatar({
  name,
  tint,
  size = "md",
  className,
  title,
  style,
  ...rest
}: {
  name: string;
  tint?: string;
  size?: Size;
  className?: string;
  title?: string;
} & Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "title"
>): React.ReactElement {
  const px = SIZE_PX[size];
  const fontSize = FONT_PX[size];
  const background = tint ?? hashTint(name);
  return (
    <span
      data-slot="user-avatar"
      data-size={size}
      title={title ?? name}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold uppercase",
        className,
      )}
      style={{
        width: px,
        height: px,
        background,
        color: "var(--ink)",
        fontSize,
        ...style,
      }}
      {...rest}
    >
      {computeInitials(name)}
    </span>
  );
}
