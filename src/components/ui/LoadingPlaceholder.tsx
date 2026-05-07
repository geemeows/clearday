import type React from "react";
import { cn } from "#/lib/cn";

export function LoadingPlaceholder({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <p
      data-slot="loading-placeholder"
      className={cn("text-sm text-muted-foreground", className)}
    >
      {children ?? "Loading…"}
    </p>
  );
}
