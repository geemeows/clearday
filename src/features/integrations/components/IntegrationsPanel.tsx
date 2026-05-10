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

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "#/components/coss/avatar";
import { Button } from "#/components/coss/button";
import { Input } from "#/components/coss/input";
import { SettingsPanel } from "#/components/ui/SettingsPanel";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
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
    scopes: "calendar.readonly, calendar.events",
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

const WEEK_START_KEY = "devy:weekStart";

type WeekStart = "sunday" | "monday";

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
  initialWeekStart?: WeekStart;
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
  initialWeekStart,
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
  const [weekStart, setWeekStart] = useState<WeekStart>(
    () => initialWeekStart ?? readWeekStart(),
  );

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

  const { data, error: loadError, busy, reload } = useAsyncPanel<PanelData>({
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

  const onWeekStartChange = (next: WeekStart) => {
    setWeekStart(next);
    persistWeekStart(next);
  };

  return (
    <SettingsPanel
      title="Integrations"
      desc="Per-user backend — refresh tokens stored in your own Supabase."
      error={error}
      busy={busy && !data}
      className="space-y-4"
    >
      <ul
        aria-label="Integration providers"
        className="space-y-4"
      >
        {PROVIDERS.map((provider) => {
          const accounts = accountsByProvider[provider.id] ?? [];
          const isProviderBusy = busyProvider === provider.providerKey;
          return (
            <li
              key={provider.id}
              aria-label={`${provider.label} integration`}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <header className="flex items-center gap-3 px-4 py-3">
                <SourceGlyph source={provider.kind} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{provider.label}</span>
                    <span className="text-[11px] text-muted-foreground">
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

              {accounts.length > 0 ? (
                <ul
                  aria-label={`${provider.label} accounts`}
                  className="divide-y divide-border border-border border-t"
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
              ) : null}

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
                  onChange={onWeekStartChange}
                />
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
          <span className="truncate font-medium text-sm">{handle}</span>
          {account.primary ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              Primary
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <output
            aria-label={`${handle} status: ${statusLabel(account.status)}`}
            data-account-status={account.status}
            className={cn("h-2 w-2 rounded-full", dotClass(account.status))}
          />
          <span className="text-[11px] text-muted-foreground">
            {statusText(account, now)}
          </span>
          {account.context ? (
            <span className="text-[11px] text-muted-foreground">
              · {account.context}
            </span>
          ) : null}
        </div>
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
    <section className="border-border border-t px-4 py-3">
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
    <section className="border-border border-t px-4 py-3">
      <h3 className="font-semibold text-sm tracking-tight">Week start</h3>
      <p className="mt-1 text-muted-foreground text-xs">
        First day of the week in the Calendar view. Applies to all your
        connected calendars.
      </p>
      <div
        role="radiogroup"
        aria-label="Week start"
        className="mt-2 inline-flex rounded-md border border-border bg-background p-0.5"
      >
        {(["sunday", "monday"] as const).map((day) => (
          <button
            key={day}
            type="button"
            role="radio"
            aria-checked={weekStart === day}
            onClick={() => onChange(day)}
            className={cn(
              "rounded-sm px-3 py-1 text-xs capitalize",
              weekStart === day
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {day}
          </button>
        ))}
      </div>
    </section>
  );
}

function readWeekStart(): WeekStart {
  if (typeof window === "undefined") return "monday";
  try {
    const v = window.localStorage.getItem(WEEK_START_KEY);
    return v === "sunday" ? "sunday" : "monday";
  } catch {
    return "monday";
  }
}

function persistWeekStart(value: WeekStart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEEK_START_KEY, value);
  } catch {
    // localStorage may be unavailable (private mode); the dispatch below
    // still gives in-memory listeners a chance to react.
  }
  try {
    window.dispatchEvent(
      new CustomEvent("devy:weekStartChanged", { detail: { weekStart: value } }),
    );
  } catch {
    // CustomEvent isn't available (very old runtimes). Silently skip.
  }
}

function accountCountLabel(n: number): string {
  if (n === 0) return "Not connected";
  if (n === 1) return "1 account";
  return `${n} accounts`;
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
