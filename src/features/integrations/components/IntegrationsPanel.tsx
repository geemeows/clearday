// Settings → Integrations panel (per PRD #29 mockup #2).
//
// Lists each provider as a row with SourceGlyph, name, description, scopes,
// live status (read off /api/sources — derivation is server-side, see
// features/integrations/provider-account-status.ts), Reauthorize button, and
// an on/off Switch. Below the list, a Slack channel allowlist renders
// existing channels as removable chips with a "+ Add channel" input.
//
// Backend persistence for the on/off toggle and allowlist is deferred —
// edits update local state only, matching the per-section slice pattern.

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import type { ProviderAccountStatus } from "#/features/integrations/provider-account-status";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";

type ApiSource = {
  provider: string;
  status: ProviderAccountStatus;
  last_polled_at?: string | null;
};

type SourcesPayload = { sources: ApiSource[] };

type DisconnectResult = { ok: boolean; error?: string };
type ConnectUrlResult = { ok: boolean; url?: string; error?: string };

type RowDef = {
  id: string;
  providerKey: string;
  kind: SourceKind;
  label: string;
  description: string;
  scopes: string;
  isMock?: boolean;
};

const ROWS: ReadonlyArray<RowDef> = [
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
    // TODO(post-redesign): wire to real Linear adapter — see PRD #29 provider scope.
    isMock: true,
  },
];

const DEFAULT_SLACK_CHANNELS = ["#eng-platform", "#oncall", "#design-review"];

export type IntegrationsPanelProps = {
  sourcesLoader?: () => Promise<SourcesPayload>;
  initialAllowlist?: string[];
  now?: number;
  disconnect?: (provider: string) => Promise<DisconnectResult>;
  connectUrl?: (provider: string) => Promise<ConnectUrlResult>;
  openUrl?: (url: string) => void;
};

export function IntegrationsPanel({
  sourcesLoader,
  initialAllowlist,
  now,
  disconnect,
  connectUrl,
  openUrl,
}: IntegrationsPanelProps = {}) {
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ROWS.map((r) => [r.id, true])),
  );
  const [channels, setChannels] = useState<string[]>(
    () => initialAllowlist ?? DEFAULT_SLACK_CHANNELS,
  );
  const [draft, setDraft] = useState("");
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () =>
      sourcesLoader ??
      (() => apiFetch("/api/sources") as Promise<SourcesPayload>),
    [sourcesLoader],
  );
  const doDisconnect = useMemo(
    () =>
      disconnect ??
      ((provider: string) =>
        apiFetch(`/api/integrations/${provider}`, {
          method: "DELETE",
        }) as Promise<DisconnectResult>),
    [disconnect],
  );
  const doConnectUrl = useMemo(
    () =>
      connectUrl ??
      ((provider: string) =>
        apiFetch(
          `/api/providers/${provider}/connect-url`,
        ) as Promise<ConnectUrlResult>),
    [connectUrl],
  );
  const doOpen = useMemo(
    () =>
      openUrl ??
      ((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      }),
    [openUrl],
  );

  const refresh = useCallback(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        const next: Record<string, RowStatus> = {};
        for (const row of ROWS) {
          if (row.isMock) {
            next[row.id] = { status: "neutral", lastPolledAt: null };
            continue;
          }
          const match = body.sources.find(
            (s) => s.provider === row.providerKey,
          );
          next[row.id] = {
            status: match?.status ?? "neutral",
            lastPolledAt: match?.last_polled_at ?? null,
          };
        }
        setStatuses(next);
      })
      .catch(() => {
        // Leave dots neutral on auth/network failure.
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => refresh(), [refresh]);

  const onReauthorize = async (providerKey: string) => {
    setBusyProvider(providerKey);
    setError(null);
    try {
      const out = await doConnectUrl(providerKey);
      if (out.ok && out.url) doOpen(out.url);
      else setError(out.error ?? "could not start connection");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProvider(null);
    }
  };

  const onDisconnect = async (providerKey: string) => {
    setBusyProvider(providerKey);
    setError(null);
    try {
      const out = await doDisconnect(providerKey);
      if (!out.ok) {
        setError(out.error ?? "disconnect failed");
        return;
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProvider(null);
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

  return (
    <section>
      <header>
        <h2 className="font-semibold text-xl">Integrations</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Connect the sources Devy reads from. Reauthorize re-runs the OAuth
          flow; the toggle pauses ingestion locally.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mt-3 text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <ul
        aria-label="Integration providers"
        className="mt-6 divide-y divide-border rounded-md border border-border"
      >
        {ROWS.map((row) => {
          const meta: RowStatus = statuses[row.id] ?? {
            status: "neutral",
            lastPolledAt: null,
          };
          const isEnabled = enabled[row.id] ?? true;
          const isConnected = !row.isMock && meta.status !== "neutral";
          const isBusy = busyProvider === row.providerKey;
          return (
            <li
              key={row.id}
              aria-label={`${row.label} integration`}
              className="flex items-center gap-4 px-4 py-4"
            >
              <SourceGlyph source={row.kind} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{row.label}</span>
                  {row.isMock ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      Mock
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {row.description}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {row.scopes}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <output
                    aria-label={`${row.label} status: ${statusLabel(meta.status)}`}
                    data-source={row.id}
                    data-status={meta.status}
                    className={cn(
                      "h-2 w-2 rounded-full",
                      dotClass(meta.status),
                    )}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {statusText(row, meta, now)}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || row.isMock}
                onClick={() => onReauthorize(row.providerKey)}
              >
                Reauthorize
              </Button>
              {isConnected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => onDisconnect(row.providerKey)}
                  aria-label={`Disconnect ${row.label}`}
                >
                  Disconnect
                </Button>
              ) : null}
              <Switch
                aria-label={`${row.label} enabled`}
                checked={isEnabled}
                onCheckedChange={(next) =>
                  setEnabled((prev) => ({ ...prev, [row.id]: next }))
                }
              />
            </li>
          );
        })}
      </ul>

      <section className="mt-8">
        <h3 className="font-semibold text-base">Slack channel allowlist</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          <code>@here</code> / <code>@channel</code> only become Signals in
          channels listed here. DMs and explicit @-mentions always come through.
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
                  onClick={() => onRemoveChannel(name)}
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
            onAddChannel();
          }}
        >
          <Input
            aria-label="Add Slack channel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="#channel"
            className="max-w-xs"
          />
          <Button type="submit" variant="outline" size="sm">
            <Plus className="size-3.5" />
            Add channel
          </Button>
        </form>
      </section>
    </section>
  );
}

type RowStatus = {
  status: ProviderAccountStatus;
  lastPolledAt: string | null;
};

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

function statusText(row: RowDef, meta: RowStatus, now?: number): string {
  if (row.isMock) return "Mocked · live integration coming soon";
  switch (meta.status) {
    case "ok":
      if (row.providerKey === "slack") return "live · 2 events / min";
      if (meta.lastPolledAt)
        return `polled ${formatRelative(meta.lastPolledAt, now)}`;
      return "Connected";
    case "stale":
      return meta.lastPolledAt
        ? `stale · last polled ${formatRelative(meta.lastPolledAt, now)}`
        : "stale";
    case "rate_limited":
      return "rate-limited · retry 0:42";
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
