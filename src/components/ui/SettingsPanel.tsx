import type React from "react";
import { ErrorAlert } from "#/components/ui/ErrorAlert";
import { LoadingPlaceholder } from "#/components/ui/LoadingPlaceholder";
import { cn } from "#/lib/cn";

export function SettingsPanel({
  title,
  desc,
  error,
  busy,
  children,
  className,
}: {
  title: string;
  desc: string;
  error?: Error | string | null;
  busy?: boolean;
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section
      aria-label={title}
      data-slot="settings-panel"
      className={cn(
        "mt-8 rounded-md border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      <h2 className="font-semibold text-base text-foreground">{title}</h2>
      <p className="mt-1 text-muted-foreground text-sm">{desc}</p>

      {error ? <ErrorAlert error={error} className="mt-3" /> : null}

      {busy ? <LoadingPlaceholder className="mt-3" /> : null}

      {children}
    </section>
  );
}
