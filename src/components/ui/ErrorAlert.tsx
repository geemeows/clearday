import type React from "react";
import { cn } from "#/lib/cn";

export function ErrorAlert({
  error,
  className,
}: {
  error: Error | string | null | undefined;
  className?: string;
}): React.ReactElement | null {
  if (error == null) return null;
  const message = error instanceof Error ? error.message : error;
  if (!message) return null;
  return (
    <p
      role="alert"
      data-slot="error-alert"
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      {message}
    </p>
  );
}
