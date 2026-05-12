// Settings → Integrations panel.
//
// One provider card per provider. Each card has a header (glyph, name, account
// count, description, single "+ Add account" button) and a list of AccountRow
// rows below it — one per connected account. Provider-scoped settings (Slack
// channel allowlist, Google Calendar week-start) nest below the account list,
// inside the same card. There is no per-account on/off toggle and no
// provider-level toggle anywhere; account presence is the on/off.
//
// Status reads off /api/sources, which after the multi-account foundations
// reshape returns one row per (provider, account_id) with the account's
// synthetic id, handle, primary flag, and context. Reauthorize hits the
// connect-url proxy keyed by account_id (#122). Remove hits
// DELETE /api/accounts/:id (#122).

import { ChevronDown, Plus, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { SettingsPanel } from "#/components/SettingsPanel";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import type { WeekStart } from "#/features/settings/week-start/api";
import { useWeekStart } from "#/features/settings/week-start/use-week-start";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { useAsyncPanel } from "#/hooks/useAsyncPanel";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";

type ApiSource = {
  provider: string;
  status: ProviderAccountStatus;
  last_polled_at?: string | null;
  id?: string | null;
  account_id?: string | null;
  handle?: string | null;
  display_name?: string | null;
  context?: string | null;
  primary?: boolean | null;
};

type SourcesPayload = { sources: ApiSource[] };

type ConnectUrlResult = { ok: boolean; url?: string; error?: string };
type RemoveResult = { ok: boolean; error?: string };

type ProviderDef = {
  id: string;
  providerKey: string;
  kind: SourceKind;
  label: string;
  description: string;
  scopes: string;
  isMock?: boolean;
};

const PROVIDERS: ReadonlyArray<ProviderDef> = [
  {
    id: "github",
    providerKey: "github",
    kind: "git",
    label: "GitHub",
    description: "Pull requests, reviews, and CI status",
    scopes: "repo, read:user, read:org",
  },
  {
    id: "slack",
    providerKey: "slack",
    kind: "slack",
    label: "Slack",
    description: "DMs, mentions, and allowlisted channels",
    scopes: "channels:read, chat:write, dnd:write",
  },
  {
    id: "google-calendar",
    providerKey: "google",
    kind: "cal",
    label: "Google Calendar",
    description: "Today's meetings and conflict detection",
    scopes: "calendar.readonly, calendar.events, spreadsheets, drive.file",
  },
  {
    id: "linear",
    providerKey: "linear",
    kind: "task",
    label: "Linear",
    description: "Tickets and sprint state",
    scopes: "issues:read, team:read",
    isMock: true,
  },
];

const DEFAULT_SLACK_CHANNELS = ["#eng-platform", "#oncall", "#design-review"];

const WEEK_START_OPTIONS: ReadonlyArray<{ id: WeekStart; label: string }> = [
  { id: "sun", label: "Sunday" },
  { id: "mon", label: "Monday" },
  { id: "sat", label: "Saturday" },
];

export type AccountRow = {
  id: string;
  account_id: string | null;
  handle: string | null;
  display_name: string | null;
  context: string | null;
  primary: boolean;
  status: ProviderAccountStatus;
  lastPolledAt: string | null;
};

export type IntegrationsPanelProps = {
  sourcesLoader?: () => Promise<SourcesPayload>;
  initialAllowlist?: string[];
  now?: number;
  connectUrl?: (
    provider: string,
    accountId?: string,
  ) => Promise<ConnectUrlResult>;
  removeAccount?: (accountId: string) => Promise<RemoveResult>;
  openUrl?: (url: string) => void;
};

type PanelData = { accountsByProvider: Record<string, AccountRow[]> };

export function IntegrationsPanel({
  sourcesLoader,
  initialAllowlist,
  now,
  connectUrl,
  removeAccount,
  openUrl,
}: IntegrationsPanelProps = {}) {
  const [channels, setChannels] = useState<string[]>(
    () => initialAllowlist ?? DEFAULT_SLACK_CHANNELS,
  );
  const [draft, setDraft] = useState("");
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const { weekStart, setWeekStart } = useWeekStart();

  const load = useMemo(
    () =>
      sourcesLoader ??
      (() => apiFetch("/api/sources") as Promise<SourcesPayload>),
    [sourcesLoader],
  );
  const doConnectUrl = useMemo(
    () =>
      connectUrl ??
      ((provider: string, accountId?: string) => {
        const qs = accountId
          ? `?account_id=${encodeURIComponent(accountId)}`
          : "";
        return apiFetch(
          `/api/providers/${provider}/connect-url${qs}`,
        ) as Promise<ConnectUrlResult>;
      }),
    [connectUrl],
  );
  const doRemove = useMemo(
    () =>
      removeAccount ??
      ((accountId: string) =>
        apiFetch(`/api/accounts/${accountId}`, {
          method: "DELETE",
        }) as Promise<RemoveResult>),
    [removeAccount],
  );
  const doOpen = useMemo(
    () =>
      openUrl ??
      ((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      }),
    [openUrl],
  );

  const {
    data,
    error: loadError,
    busy,
    reload,
  } = useAsyncPanel<PanelData>({
    load: async () => {
      const body = await load();
      const accountsByProvider: Record<string, AccountRow[]> = {};
      for (const provider of PROVIDERS) {
        accountsByProvider[provider.id] = [];
      }
      for (const src of body.sources) {
        // Only rows with a synthetic id are real connected accounts. The
        // server emits a neutral placeholder row (id null) for unconnected
        // providers so the FE can keep rendering all providers; that
        // placeholder doesn't represent an account and is dropped here.
        if (!src.id) continue;
        const provider = PROVIDERS.find((p) => p.providerKey === src.provider);
        if (!provider) continue;
        accountsByProvider[provider.id]?.push({
          id: src.id,
          account_id: src.account_id ?? null,
          handle: src.handle ?? null,
          display_name: src.display_name ?? null,
          context: src.context ?? null,
          primary: src.primary === true,
          status: src.status,
          lastPolledAt: src.last_polled_at ?? null,
        });
      }
      return { accountsByProvider };
    },
    save: async () => {},
  });

  const accountsByProvider = data?.accountsByProvider ?? {};
  const error = actionError ?? (loadError ? loadError.message : null);
  const totalAccounts = Object.values(accountsByProvider).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const onAddAccount = async (providerKey: string) => {
    setBusyProvider(providerKey);
    setActionError(null);
    try {
      const out = await doConnectUrl(providerKey);
      if (out.ok && out.url) doOpen(out.url);
      else setActionError(out.error ?? "could not start connection");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProvider(null);
    }
  };

  const onReauthorize = async (providerKey: string, accountId: string) => {
    setBusyAccount(accountId);
    setActionError(null);
    try {
      const out = await doConnectUrl(providerKey, accountId);
      if (out.ok && out.url) doOpen(out.url);
      else setActionError(out.error ?? "could not start reauthorize");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAccount(null);
    }
  };

  const onRemoveAccount = async (accountId: string) => {
    setBusyAccount(accountId);
    setActionError(null);
    try {
      const out = await doRemove(accountId);
      if (!out.ok) {
        setActionError(out.error ?? "remove failed");
        return;
      }
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAccount(null);
    }
  };

  const onAddChannel = () => {
    const raw = draft.trim();
    if (!raw) return;
    const name = raw.startsWith("#") ? raw : `#${raw}`;
    if (channels.includes(name)) {
      setDraft("");
      return;
    }
    setChannels((prev) => [...prev, name]);
    setDraft("");
  };

  const onRemoveChannel = (name: string) => {
    setChannels((prev) => prev.filter((c) => c !== name));
  };

  const onToggleCollapsed = (providerId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  return (
    <SettingsPanel
      title="Integrations"
      desc="Per-user backend — refresh tokens stored in your own Supabase."
      error={error}
      busy={busy && !data}
      className="space-y-4"
    >
      <aside
        aria-label="Google Sheets re-consent"
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-lg border border-border bg-card p-3.5"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/40"
        >
          <span className="inline-flex size-[22px] items-center justify-center rounded-sm bg-emerald-600 font-bold text-[13px] text-white">
            S
          </span>
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              Google Sheets — for Career sync
            </span>
            <span className="rounded-full bg-amber-500/15 px-1.5 py-px font-bold text-[10px] text-amber-700 uppercase tracking-wider dark:text-amber-300">
              Re-auth needed
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Adds <code className="font-mono text-[11px]">spreadsheets</code> +{" "}
            <code className="font-mono text-[11px]">drive.file</code> scopes to
            your existing Google connection. Per-file access only — Devy can
            only read or write sheets it created.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={busyProvider === "google"}
          onClick={() => onAddAccount("google")}
          aria-label="Re-authorize Google"
        >
          <ShieldCheck className="size-3.5" />
          Re-authorize Google
        </Button>
      </aside>
      <div
        aria-label="Accounts summary"
        className="flex items-center justify-end text-muted-foreground text-xs"
      >
        {totalAccounts} {totalAccounts === 1 ? "account" : "accounts"} across{" "}
        {PROVIDERS.length} providers
      </div>
      <ul aria-label="Integration providers" className="space-y-4">
        {PROVIDERS.map((provider) => {
          const accounts = accountsByProvider[provider.id] ?? [];
          const isProviderBusy = busyProvider === provider.providerKey;
          const isExpanded = !collapsed.has(provider.id);
          const bodyId = `integration-card-body-${provider.id}`;
          return (
            <li
              key={provider.id}
              aria-label={`${provider.label} integration`}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <header
                className={cn(
                  "flex items-center gap-3.5 px-4 py-4",
                  isExpanded
                    ? "bg-[var(--surface-soft)]"
                    : "bg-[var(--surface-card)]",
                )}
              >
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={bodyId}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${provider.label} card`}
                  onClick={() => onToggleCollapsed(provider.id)}
                  className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--surface-card)] hover:text-foreground"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 transition-transform duration-150",
                      isExpanded ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
                <SourceGlyph source={provider.kind} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[15px]">
                      {provider.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {accountCountLabel(accounts.length)}
                    </span>
                    {provider.isMock ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        Mock
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {provider.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProviderBusy || provider.isMock}
                  onClick={() => onAddAccount(provider.providerKey)}
                  aria-label={`Add ${provider.label} account`}
                >
                  <Plus className="size-3.5" />
                  Add account
                </Button>
              </header>

              {isExpanded ? (
                <div id={bodyId}>
                  {accounts.length > 0 ? (
                    <ul
                      aria-label={`${provider.label} accounts`}
                      className="divide-y divide-[var(--hairline-soft)] border-[var(--hairline-soft)] border-t"
                    >
                      {accounts.map((account) => (
                        <AccountRowItem
                          key={account.id}
                          provider={provider}
                          account={account}
                          now={now}
                          busy={busyAccount === account.id}
                          onReauthorize={() =>
                            onReauthorize(provider.providerKey, account.id)
                          }
                          onRemove={() => onRemoveAccount(account.id)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <div className="flex items-center justify-center gap-1 px-4 py-5 text-muted-foreground text-[13px]">
                      No accounts connected.
                      <button
                        type="button"
                        disabled={isProviderBusy || provider.isMock}
                        onClick={() => onAddAccount(provider.providerKey)}
                        className="font-semibold text-[13px] text-primary hover:underline disabled:opacity-60"
                        aria-label={`Connect ${provider.label}`}
                      >
                        Connect one →
                      </button>
                    </div>
                  )}

                  {provider.providerKey === "slack" ? (
                    <SlackProviderSettings
                      channels={channels}
                      draft={draft}
                      onDraft={setDraft}
                      onAdd={onAddChannel}
                      onRemove={onRemoveChannel}
                    />
                  ) : null}

                  {provider.providerKey === "google" ? (
                    <CalendarProviderSettings
                      weekStart={weekStart}
                      onChange={setWeekStart}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SettingsPanel>
  );
}

function AccountRowItem({
  provider,
  account,
  now,
  busy,
  onReauthorize,
  onRemove,
}: {
  provider: ProviderDef;
  account: AccountRow;
  now?: number;
  busy: boolean;
  onReauthorize: () => void;
  onRemove: () => void;
}) {
  const handle =
    account.handle ?? account.display_name ?? account.account_id ?? "account";
  const initials = computeInitials(
    account.display_name ?? account.handle ?? account.account_id ?? "",
  );
  return (
    <li
      aria-label={`${provider.label} account ${handle}`}
      data-account-id={account.id}
      className="flex items-center gap-3 px-4 py-3"
    >
      <Avatar size="sm" aria-hidden="true">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-[14px] text-foreground">
            {handle}
          </span>
          {account.primary ? (
            <span className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Primary
            </span>
          ) : null}
          <output
            aria-label={`${handle} status: ${statusLabel(account.status)}`}
            data-account-status={account.status}
            className={cn("h-2 w-2 rounded-full", dotClass(account.status))}
          />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {statusText(account, now)}
          </span>
        </div>
        {account.context || provider.scopes ? (
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {account.context}
            {provider.scopes ? (
              <span className="ml-2 font-mono text-[10px] text-[var(--muted-soft)]">
                {provider.scopes}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onReauthorize}
        aria-label={`Reauthorize ${handle}`}
      >
        Reauthorize
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${handle}`}
        className="text-destructive hover:text-destructive"
      >
        Remove
      </Button>
    </li>
  );
}

function SlackProviderSettings({
  channels,
  draft,
  onDraft,
  onAdd,
  onRemove,
}: {
  channels: string[];
  draft: string;
  onDraft: (s: string) => void;
  onAdd: () => void;
  onRemove: (name: string) => void;
}) {
  return (
    <section className="border-[var(--hairline-soft)] border-t bg-[var(--canvas)] px-4 py-3.5">
      <h3 className="font-semibold text-sm tracking-tight">
        Slack channel allowlist
      </h3>
      <p className="mt-1 text-muted-foreground text-xs">
        <code className="rounded bg-muted px-1 py-px font-mono text-xs">
          @here
        </code>{" "}
        /{" "}
        <code className="rounded bg-muted px-1 py-px font-mono text-xs">
          @channel
        </code>{" "}
        only become Signals in channels listed here. Applies across all your
        Slack accounts. DMs and explicit @-mentions always come through.
      </p>
      <ul
        aria-label="Slack channel allowlist"
        className="mt-3 flex flex-wrap gap-2"
      >
        {channels.map((name) => (
          <li key={name}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-xs">
              {name}
              <button
                type="button"
                onClick={() => onRemove(name)}
                aria-label={`Remove ${name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <Input
          aria-label="Add Slack channel"
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder="#channel"
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm">
          <Plus className="size-3.5" />
          Add channel
        </Button>
      </form>
    </section>
  );
}

function CalendarProviderSettings({
  weekStart,
  onChange,
}: {
  weekStart: WeekStart;
  onChange: (next: WeekStart) => void;
}) {
  return (
    <section className="border-[var(--hairline-soft)] border-t bg-[var(--canvas)] px-4 py-3.5">
      <h3 className="font-semibold text-sm tracking-tight">Week starts on</h3>
      <p className="mt-1 text-muted-foreground text-xs">
        Affects the week view on the Calendar page and weekly stats.
      </p>
      <div
        role="radiogroup"
        aria-label="Week start"
        className="mt-2 inline-flex rounded-md border border-border bg-background p-0.5"
      >
        {WEEK_START_OPTIONS.map((opt) => (
          // biome-ignore lint/a11y/useSemanticElements: deliberate button-with-role=radio pattern; keeps coss styling and avoids <input type="radio"> form semantics. role="radiogroup" wraps for keyboard semantics.
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={weekStart === opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-sm px-3 py-1 text-xs",
              weekStart === opt.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function accountCountLabel(n: number): string {
  if (n === 0) return "0 accounts connected";
  if (n === 1) return "1 account connected";
  return `${n} accounts connected`;
}

function computeInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Drop a leading @ on Slack-style handles.
  const cleaned = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const parts = cleaned.split(/[\s_.-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function statusLabel(status: ProviderAccountStatus): string {
  switch (status) {
    case "ok":
      return "connected";
    case "stale":
      return "no recent activity";
    case "rate_limited":
      return "rate-limited";
    case "auth_failed":
      return "authorization failed";
    default:
      return "not connected";
  }
}

function statusText(account: AccountRow, now?: number): string {
  switch (account.status) {
    case "ok":
      return account.lastPolledAt
        ? `last sync ${formatRelative(account.lastPolledAt, now)}`
        : "Connected";
    case "stale":
      return account.lastPolledAt
        ? `stale · last sync ${formatRelative(account.lastPolledAt, now)}`
        : "stale";
    case "rate_limited":
      return "rate-limited · retry pending";
    case "auth_failed":
      return "auth failed · reauthorize to reconnect";
    default:
      return "Not connected";
  }
}

function dotClass(status: ProviderAccountStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500";
    case "stale":
    case "rate_limited":
      return "bg-amber-500";
    case "auth_failed":
      return "bg-red-500";
    default:
      return "bg-zinc-300";
  }
}

function formatRelative(iso: string, now?: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const ref = now ?? Date.now();
  const diffSec = Math.max(0, Math.round((ref - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
