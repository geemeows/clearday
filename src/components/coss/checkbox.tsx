"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";
import type * as React from "react";
import { Spinner } from "#/components/coss/spinner";
import { cn } from "#/lib/cn";

export function Checkbox({
  className,
  loading = false,
  disabled,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  loading?: boolean;
}): React.ReactElement {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[checked]:bg-primary",
        loading &&
          "cursor-progress disabled:cursor-progress disabled:opacity-100",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner
          data-slot="checkbox-spinner"
          className="size-3 text-current"
        />
      ) : (
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current transition-none"
        >
          <CheckIcon className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      )}
    </CheckboxPrimitive.Root>
  );
}
