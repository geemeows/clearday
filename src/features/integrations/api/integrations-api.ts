// Pure module behind /api/integrations GET and /api/integrations/:provider
// DELETE.
//
// The Integrations settings sub-page surfaces per-provider connection
// detail (account, scopes granted, last sync time) and offers Disconnect.
// Reauthorize re-runs the existing OAuth flow through the auth-proxy and
// is handled by the existing /api/providers/:name/connect-url endpoint.
//
// Pure so the store is injected; trivially unit-testable without Supabase.

export const KNOWN_PROVIDERS = [
  "github",
  "slack",
  "google",
  "linear",
  "jira",
] as const;
export type IntegrationProvider = (typeof KNOWN_PROVIDERS)[number];

export type ProviderAccountRow = {
  provider: string;
  account_id: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Multi-account reshape (#121) — true on the provider's primary row.
   *  Pre-reshape rows behave as primary by virtue of being the only row. */
  primary?: boolean;
};

export type IntegrationView = {
  provider: IntegrationProvider;
  status: "connected" | "disconnected";
  account_id: string | null;
  scopes: string[];
  connected_at: string | null;
  last_sync_at: string | null;
  expires_at: string | null;
};

export type IntegrationsStore = {
  loadAccounts: () => Promise<ProviderAccountRow[]>;
  deleteAccount: (provider: string) => Promise<void>;
};

export async function getIntegrations(
  store: IntegrationsStore,
): Promise<{ integrations: IntegrationView[] }> {
  const rows = await store.loadAccounts();
  // Multi-account reshape (#121): collapse to the primary row per provider
  // so the existing single-account UI keeps working. Multi-row rendering
  // lands in the IntegrationsPanel rewrite (#123).
  const byProvider = new Map<string, ProviderAccountRow>();
  for (const row of rows) {
    const current = byProvider.get(row.provider);
    if (!current) {
      byProvider.set(row.provider, row);
      continue;
    }
    if (row.primary === true && current.primary !== true) {
      byProvider.set(row.provider, row);
    }
  }
  const integrations = KNOWN_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return toView(provider, row);
  });
  return { integrations };
}

function toView(
  provider: IntegrationProvider,
  row: ProviderAccountRow | undefined,
): IntegrationView {
  if (!row) {
    return {
      provider,
      status: "disconnected",
      account_id: null,
      scopes: [],
      connected_at: null,
      last_sync_at: null,
      expires_at: null,
    };
  }
  return {
    provider,
    status: "connected",
    account_id: row.account_id ?? null,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    connected_at: row.created_at ?? null,
    last_sync_at: row.updated_at ?? null,
    expires_at: row.expires_at ?? null,
  };
}

export async function disconnectIntegration(
  provider: string,
  store: IntegrationsStore,
): Promise<{ ok: true; provider: string } | { ok: false; error: string }> {
  if (!(KNOWN_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, error: "unknown provider" };
  }
  await store.deleteAccount(provider);
  return { ok: true, provider };
}
