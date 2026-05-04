// Cron orchestrator. Wrangler triggers `scheduled()` in the Worker every
// minute (configured in wrangler.jsonc); this module dispatches per-provider
// poll jobs that read tokens from provider_accounts, call the adapter, and
// upsert each Signal into the store.
//
// Each provider's poll is best-effort and isolated: a failure in one source
// must not block others. Errors are returned so the caller can log them.

import type { InboxRule } from "#/lib/inbox-rules-engine";
import {
  type ExchangeEnv,
  type FetchLike,
  refreshGoogleToken,
} from "#/lib/oauth-exchange";
import { pollGithubSignals } from "#/lib/provider-adapter/github";
import { pollCalendarSignals } from "#/lib/provider-adapter/google-calendar";
import type { SupabaseLike } from "#/lib/signal-store";
import { upsertSignal } from "#/lib/signal-store";

export type ProviderAccountRow = {
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

export type RefreshedAccountUpdate = {
  provider: string;
  access_token: string;
  expires_at: string | null;
};

export type OrchestratorDeps = {
  /** Returns provider_accounts rows for connected providers. */
  loadAccounts: () => Promise<ProviderAccountRow[]>;
  /** Persist a refreshed access_token + expires_at back to provider_accounts. */
  saveRefreshedToken?: (update: RefreshedAccountUpdate) => Promise<void>;
  /** Supabase write client for signal upserts (service-role in cron context). */
  store: SupabaseLike;
  /** HTTP fetch wrapper, injected for tests. */
  fetch: typeof fetch;
  /** OAuth env (client ids/secrets). Required when google needs a refresh. */
  oauthEnv?: ExchangeEnv;
  /** Now, injected for deterministic expiry checks in tests. */
  now?: () => Date;
  /**
   * Loaded once per tick; passed to every upsertSignal so the inbox-rules
   * engine can apply overrides at the write seam. Optional — when absent,
   * upsertSignal writes are unmodified.
   */
  loadInboxRules?: () => Promise<InboxRule[]>;
};

export type OrchestratorReport = {
  provider: string;
  upserted: number;
  error?: string;
};

const REFRESH_LEEWAY_SECONDS = 60;

export async function runScheduledPoll(
  deps: OrchestratorDeps,
): Promise<OrchestratorReport[]> {
  const accounts = await deps.loadAccounts();
  const rules = deps.loadInboxRules ? await deps.loadInboxRules() : [];
  const reports: OrchestratorReport[] = [];
  for (const account of accounts) {
    try {
      const upserted = await pollOne(account, deps, rules);
      reports.push({ provider: account.provider, upserted });
    } catch (err) {
      reports.push({
        provider: account.provider,
        upserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return reports;
}

async function pollOne(
  account: ProviderAccountRow,
  deps: OrchestratorDeps,
  rules: InboxRule[],
): Promise<number> {
  if (!account.access_token) throw new Error("no access_token");

  if (account.provider === "github") {
    const signals = await pollGithubSignals(
      account.access_token,
      async (url, init) => deps.fetch(url, init),
    );
    for (const sig of signals) await upsertSignal(deps.store, sig, { rules });
    return signals.length;
  }

  if (account.provider === "google") {
    const accessToken = await ensureFreshGoogleToken(account, deps);
    const signals = await pollCalendarSignals(
      accessToken,
      async (url, init) => deps.fetch(url, init),
      deps.now?.(),
    );
    for (const sig of signals) await upsertSignal(deps.store, sig, { rules });
    return signals.length;
  }

  // Other providers land in later slices.
  return 0;
}

async function ensureFreshGoogleToken(
  account: ProviderAccountRow,
  deps: OrchestratorDeps,
): Promise<string> {
  if (!account.access_token) throw new Error("no access_token");
  if (!isExpired(account.expires_at, deps.now?.() ?? new Date())) {
    return account.access_token;
  }
  if (!account.refresh_token) {
    throw new Error("google access_token expired and no refresh_token stored");
  }
  if (!deps.oauthEnv) {
    throw new Error("oauthEnv missing — cannot refresh google token");
  }
  const fetchLike: FetchLike = async (url, init) => {
    const res = await deps.fetch(url, init);
    return res;
  };
  const refreshed = await refreshGoogleToken(
    account.refresh_token,
    deps.oauthEnv,
    fetchLike,
  );
  if (deps.saveRefreshedToken) {
    await deps.saveRefreshedToken({
      provider: "google",
      access_token: refreshed.access_token,
      expires_at: refreshed.expires_at,
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
