// Reusable per-action account override picker (#119).
//
// Renders inline at the action site (calendar create, draft-reply send,
// GitHub action). Hidden entirely when the provider has exactly one
// connected account — single-account providers don't need disambiguation.
// Renders a status dot per option and surfaces an inline "Reauthorize"
// affordance when the current selection is unhealthy so users don't have
// to leave the action surface for Settings.
//
// Shape stays narrow: a native <select> + a status dot + an optional
// inline reauth link. The picker doesn't know about per-action
// persistence — the PRD parks that out of scope. Overrides are caller
// state.

import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import { cn } from "#/lib/cn";

export type AccountPickerOption = {
  id: string;
  handle: string | null;
  display_name?: string | null;
  context?: string | null;
  primary?: boolean;
  status: ProviderAccountStatus;
};

const UNHEALTHY: ReadonlySet<ProviderAccountStatus> = new Set([
  "auth_failed",
  "rate_limited",
  "stale",
]);

const DOT_CLASS: Record<ProviderAccountStatus, string> = {
  ok: "bg-emerald-500",
  stale: "bg-amber-500",
  rate_limited: "bg-amber-500",
  auth_failed: "bg-rose-500",
  neutral: "bg-muted-foreground/40",
};

export type AccountPickerProps = {
  providerId: string;
  accounts: AccountPickerOption[];
  value: string;
  onChange: (accountId: string) => void;
  onReauthorize?: (accountId: string) => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Inline account override picker. Renders nothing when the provider has
 * exactly one connected account.
 */
export function AccountPicker({
  providerId,
  accounts,
  value,
  onChange,
  onReauthorize,
  label,
  disabled,
}: AccountPickerProps) {
  if (accounts.length <= 1) return null;
  const selected = accounts.find((a) => a.id === value) ?? accounts[0];
  const unhealthy = selected ? UNHEALTHY.has(selected.status) : false;
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        data-account-status={selected?.status ?? "neutral"}
        className={cn(
          "h-2 w-2 rounded-full",
          DOT_CLASS[selected?.status ?? "neutral"],
        )}
      />
      <select
        aria-label={label ?? `${providerId} account`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/40 disabled:opacity-60"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {optionLabel(account)}
          </option>
        ))}
      </select>
      {unhealthy && onReauthorize && selected ? (
        <button
          type="button"
          onClick={() => onReauthorize(selected.id)}
          aria-label={`Reauthorize ${selected.handle ?? selected.id}`}
          className="text-rose-700 underline disabled:opacity-60"
          disabled={disabled}
        >
          Reauthorize
        </button>
      ) : null}
    </div>
  );
}

function optionLabel(a: AccountPickerOption): string {
  const handle = a.handle ?? a.display_name ?? a.id;
  const ctx = a.context ? ` · ${a.context}` : "";
  const tag = a.primary ? " (primary)" : "";
  return `${handle}${ctx}${tag}`;
}
