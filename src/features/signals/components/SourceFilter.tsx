// Inbox source filter chip rail (#118).
//
// Renders one chip per *provider* (not per account), regardless of how many
// accounts a provider has. When a provider has ≥2 connected accounts, a
// caret on the chip opens a submenu with one entry per account (handle +
// context + status dot). Selecting the chip body filters Signals to all
// accounts of that provider; selecting an account entry scopes to that
// single account_id. The default state is "All sources" — the union across
// every connected account.

import { useState } from "react";
import { providerSourceKind } from "#/features/integrations/display";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import type { SignalProvider } from "#/shared/signal";

export type SourceAccount = {
  id: string;
  handle: string | null;
  context: string | null;
  status: ProviderAccountStatus;
};

export type SourceProvider = {
  provider: SignalProvider;
  label: string;
  accounts: SourceAccount[];
};

export type SourceSelection = {
  provider: SignalProvider | null;
  accountId: string | null;
};

const DOT_CLASS: Record<ProviderAccountStatus, string> = {
  ok: "bg-emerald-500",
  stale: "bg-amber-500",
  rate_limited: "bg-amber-500",
  auth_failed: "bg-rose-500",
  neutral: "bg-muted-foreground/40",
};

export function SourceFilter({
  providers,
  value,
  onChange,
}: {
  providers: SourceProvider[];
  value: SourceSelection;
  onChange: (next: SourceSelection) => void;
}) {
  const [openProvider, setOpenProvider] = useState<SignalProvider | null>(null);
  const allActive = value.provider === null && value.accountId === null;
  return (
    <nav
      aria-label="Inbox source filter"
      data-slot="source-filter"
      className="flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        aria-pressed={allActive}
        onClick={() => onChange({ provider: null, accountId: null })}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
        style={{
          fontSize: 12,
          background: allActive ? "var(--ink)" : "var(--surface-soft)",
          color: allActive ? "var(--canvas)" : "var(--ink)",
          border: "1px solid transparent",
        }}
      >
        All sources
      </button>
      {providers.map((p) => {
        const providerActive =
          value.provider === p.provider && value.accountId === null;
        const accountActive =
          value.provider === p.provider && value.accountId !== null;
        const active = providerActive || accountActive;
        const expandable = p.accounts.length >= 2;
        const expanded = openProvider === p.provider;
        const selectedAccount = accountActive
          ? p.accounts.find((a) => a.id === value.accountId) ?? null
          : null;
        return (
          <div key={p.provider} className="relative inline-flex items-center">
            <button
              type="button"
              aria-pressed={active}
              data-provider={p.provider}
              onClick={() => {
                onChange({ provider: p.provider, accountId: null });
                setOpenProvider(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[5px] font-medium leading-tight transition-colors"
              style={{
                fontSize: 12,
                background: active ? "var(--ink)" : "var(--surface-soft)",
                color: active ? "var(--canvas)" : "var(--ink)",
                border: "1px solid transparent",
                paddingRight: expandable ? 6 : undefined,
              }}
            >
              <SourceGlyph source={providerSourceKind(p.provider)} size={14} />
              <span>
                {p.label}
                {selectedAccount && selectedAccount.handle
                  ? ` · ${selectedAccount.handle}`
                  : ""}
              </span>
            </button>
            {expandable && (
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={expanded}
                aria-label={`Pick a ${p.label} account`}
                data-slot="source-filter-expand"
                data-provider={p.provider}
                onClick={() =>
                  setOpenProvider((prev) =>
                    prev === p.provider ? null : p.provider,
                  )
                }
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-(--surface-strong)"
                style={{ fontSize: 10, color: "var(--muted-foreground)" }}
              >
                ▾
              </button>
            )}
            {expandable && expanded && (
              <ul
                role="menu"
                data-slot="source-filter-menu"
                data-provider={p.provider}
                className="absolute left-0 top-full z-10 mt-1 min-w-[200px] overflow-hidden rounded-lg shadow-md"
                style={{
                  background: "var(--canvas)",
                  border: "1px solid var(--hairline-soft)",
                }}
              >
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onChange({ provider: p.provider, accountId: null });
                      setOpenProvider(null);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-(--surface-soft)"
                    style={{ color: "var(--ink)" }}
                  >
                    All {p.label} accounts
                  </button>
                </li>
                {p.accounts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="menuitem"
                      data-account-id={a.id}
                      onClick={() => {
                        onChange({ provider: p.provider, accountId: a.id });
                        setOpenProvider(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--surface-soft)"
                      style={{ color: "var(--ink)" }}
                    >
                      <span
                        aria-hidden="true"
                        data-account-status={a.status}
                        className={`h-2 w-2 rounded-full ${DOT_CLASS[a.status]}`}
                      />
                      <span className="flex-1 truncate">
                        {a.handle ?? a.id}
                      </span>
                      {a.context && (
                        <span
                          className="truncate text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {a.context}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
