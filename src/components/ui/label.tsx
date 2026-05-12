"use client";

import type * as React from "react";
import { cn } from "#/lib/cn";

export function Label({
  className,
  ...props
}: React.ComponentProps<"label">): React.ReactElement {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: this is a generic Label primitive — consumers attach htmlFor or wrap an input/control.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
