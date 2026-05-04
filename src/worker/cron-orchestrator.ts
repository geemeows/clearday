// Cron orchestrator. Wrangler triggers `scheduled()` in the Worker every
// minute (configured in wrangler.jsonc); this module dispatches per-provider
// poll jobs that read tokens from provider_accounts, call the adapter, and
// upsert each Signal into the store.
//
// Each provider's poll is best-effort and isolated: a failure in one source
// must not block others. Errors are returned so the caller can log them.

import { pollGithubSignals } from "#/lib/provider-adapter/github";
import type { SupabaseLike } from "#/lib/signal-store";
import { upsertSignal } from "#/lib/signal-store";

export type ProviderAccountRow = {
  provider: string;
  access_token: string | null;
};

export type OrchestratorDeps = {
  /** Returns provider_accounts rows for connected providers. */
  loadAccounts: () => Promise<ProviderAccountRow[]>;
  /** Supabase write client for signal upserts (service-role in cron context). */
  store: SupabaseLike;
  /** HTTP fetch wrapper, injected for tests. */
  fetch: typeof fetch;
};

export type OrchestratorReport = {
  provider: string;
  upserted: number;
  error?: string;
};

export async function runScheduledPoll(
  deps: OrchestratorDeps,
): Promise<OrchestratorReport[]> {
  const accounts = await deps.loadAccounts();
  const reports: OrchestratorReport[] = [];
  for (const account of accounts) {
    if (!account.access_token) {
      reports.push({
        provider: account.provider,
        upserted: 0,
        error: "no access_token",
      });
      continue;
    }
    try {
      const upserted = await pollOne(account, deps);
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
): Promise<number> {
  if (account.provider === "github" && account.access_token) {
    const signals = await pollGithubSignals(
      account.access_token,
      async (url, init) => deps.fetch(url, init),
    );
    for (const sig of signals) {
      await upsertSignal(deps.store, sig);
    }
    return signals.length;
  }
  // Other providers land in later slices.
  return 0;
}
