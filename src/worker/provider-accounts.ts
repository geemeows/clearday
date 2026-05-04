// Persists OAuth tokens into public.provider_accounts. Uses the service-role
// key because the OAuth callback hits the Worker without a Supabase session
// (the user-agent is mid-redirect from the auth-proxy). RLS still gates
// regular reads from the SPA via the anon client and the allowed-user check.

import { createClient } from "@supabase/supabase-js";
import type { TokenRecord } from "#/lib/oauth-exchange";

export type PersistEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export function persistProviderAccount(env: PersistEnv) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (record: TokenRecord): Promise<void> => {
    const { error } = await client.from("provider_accounts").upsert(
      {
        provider: record.provider,
        account_id: record.account_id,
        access_token: record.access_token,
        refresh_token: record.refresh_token,
        expires_at: record.expires_at,
        scopes: record.scopes,
        metadata: record.metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error)
      throw new Error(`provider_accounts upsert failed: ${error.message}`);
  };
}
