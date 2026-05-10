// Cron orchestrator. Wrangler triggers `scheduled()` in the Worker every
// minute (configured in wrangler.jsonc); this module iterates the provider
// registry and dispatches per-provider poll jobs that read tokens from
// provider_accounts, refresh when needed, call the provider's poll, and
// upsert each Signal into the store.
//
// Each provider's poll is best-effort and isolated: a failure in one source
// must not block others. Errors are returned so the caller can log them.
//
// The orchestrator is provider-agnostic: adding a new provider is one folder
// under features/integrations/providers/<id>/ + one entry in the registry.

import type { Automation } from "#/features/automations/engine";
import {
  defaultClassifyError,
  type ExchangeEnv,
  type FetchLike,
  type PollCtx,
  type Provider,
  type ProviderAccountRow,
  type ProviderHealthStatus,
} from "#/features/integrations/provider";
import { isProviderId, PROVIDERS } from "#/features/integrations/providers";
import { upsertSignals } from "#/features/signals/store";
import type { SupabaseLike } from "#/shared/db";

export type { ProviderAccountRow };

export type RefreshedAccountUpdate = {
  provider: string;
  access_token: string;
  /**
   * Set when the provider rotates the refresh_token (Atlassian / Linear).
   * Omitted when the previously-stored refresh_token is still valid.
   */
  refresh_token?: string;
  expires_at: string | null;
};

export type { ProviderHealthStatus };

export type OrchestratorDeps = {
  /** Returns provider_accounts rows for connected providers. */
  loadAccounts: () => Promise<ProviderAccountRow[]>;
  /** Persist a refreshed access_token + expires_at back to provider_accounts. */
  saveRefreshedToken?: (update: RefreshedAccountUpdate) => Promise<void>;
  /**
   * Persist the latest poll outcome on provider_accounts.status so the
   * Sources rail can render yellow on rate-limit / red on auth failure.
   * Only called when the new status is classifiable; transient network
   * errors leave the prior status untouched.
   */
  saveProviderStatus?: (
    provider: string,
    status: ProviderHealthStatus,
  ) => Promise<void>;
  /**
   * Stamp `provider_accounts.last_polled_at = now()` after a successful poll.
   * Drives the Sources rail's freshness indicator.
   */
  saveLastPolledAt?: (provider: string) => Promise<void>;
  /** Supabase write client for signal upserts (service-role in cron context). */
  store: SupabaseLike;
  /** HTTP fetch wrapper, injected for tests. */
  fetch: typeof fetch;
  /** OAuth env (client ids/secrets). Required when a provider needs a refresh. */
  oauthEnv?: ExchangeEnv;
  /** Now, injected for deterministic expiry checks in tests. */
  now?: () => Date;
  /**
   * Loaded once per tick; passed to every upsertSignal so the automations
   * engine can apply `signal_ingested` internal-action overrides at the
   * write seam.
   */
  loadAutomations?: () => Promise<Automation[]>;
};

export type OrchestratorReport = {
  provider: string;
  upserted: number;
  error?: string;
  status?: ProviderHealthStatus;
};

const REFRESH_LEEWAY_SECONDS = 60;

export async function runScheduledPoll(
  deps: OrchestratorDeps,
): Promise<OrchestratorReport[]> {
  const accounts = await deps.loadAccounts();
  const automations = deps.loadAutomations ? await deps.loadAutomations() : [];
  const reports: OrchestratorReport[] = [];
  for (const account of accounts) {
    if (!isProviderId(account.provider)) continue;
    const provider = PROVIDERS[account.provider];
    try {
      const upserted = await pollOne(provider, account, deps, automations);
      const persisted = await persistStatus(deps, account.provider, "ok");
      await persistLastPolledAt(deps, account.provider);
      reports.push({
        provider: account.provider,
        upserted,
        ...(persisted ? { status: "ok" as const } : {}),
      });
    } catch (err) {
      const classify = provider.classifyError ?? defaultClassifyError;
      const status = classify(err);
      const persisted = status
        ? await persistStatus(deps, account.provider, status)
        : false;
      reports.push({
        provider: account.provider,
        upserted: 0,
        error: err instanceof Error ? err.message : String(err),
        ...(persisted && status ? { status } : {}),
      });
    }
  }
  return reports;
}

async function persistStatus(
  deps: OrchestratorDeps,
  provider: string,
  status: ProviderHealthStatus,
): Promise<boolean> {
  if (!deps.saveProviderStatus) return false;
  try {
    await deps.saveProviderStatus(provider, status);
    return true;
  } catch {
    return false;
  }
}

async function persistLastPolledAt(
  deps: OrchestratorDeps,
  provider: string,
): Promise<void> {
  if (!deps.saveLastPolledAt) return;
  try {
    await deps.saveLastPolledAt(provider);
  } catch {
    // Best-effort.
  }
}

async function pollOne(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous S/D/C
  provider: Provider<any, any, any>,
  account: ProviderAccountRow,
  deps: OrchestratorDeps,
  automations: Automation[],
): Promise<number> {
  if (!account.access_token) throw new Error("no access_token");

  const accessToken = provider.refresh
    ? await ensureFreshToken(provider, account, deps)
    : account.access_token;

  const stateDeps = { supabase: deps.store, account };
  const state = provider.loadState
    ? await provider.loadState(stateDeps)
    : (undefined as never);
  const ctx: PollCtx = {
    fetch: deps.fetch,
    now: deps.now?.() ?? new Date(),
  };

  const { signals, delta } = await provider.poll(accessToken, ctx, state);
  await upsertSignals(deps.store, signals, {
    automations,
    accountId: account.id ?? null,
  });
  if (provider.saveState) {
    try {
      await provider.saveState(stateDeps, delta);
    } catch {
      // Best-effort: state writeback failures must not mask the signals upserted.
    }
  }
  return signals.length;
}

async function ensureFreshToken(
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous S/D/C
  provider: Provider<any, any, any>,
  account: ProviderAccountRow,
  deps: OrchestratorDeps,
): Promise<string> {
  if (!account.access_token) throw new Error("no access_token");
  if (!provider.refresh) return account.access_token;
  if (!isExpired(account.expires_at, deps.now?.() ?? new Date())) {
    return account.access_token;
  }
  if (!account.refresh_token) {
    throw new Error(
      `${provider.id} access_token expired and no refresh_token stored`,
    );
  }
  if (!deps.oauthEnv) {
    throw new Error(`oauthEnv missing — cannot refresh ${provider.id} token`);
  }
  const fetchLike: FetchLike = async (url, init) => deps.fetch(url, init);
  const refreshed = await provider.refresh(
    account.refresh_token,
    deps.oauthEnv,
    fetchLike,
  );
  if (deps.saveRefreshedToken) {
    await deps.saveRefreshedToken({
      provider: provider.id,
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
      ...(refreshed.refresh_token
        ? { refresh_token: refreshed.refresh_token }
        : {}),
    });
  }
  return refreshed.access_token;
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return t - now.getTime() <= REFRESH_LEEWAY_SECONDS * 1000;
}
