// OAuth seam types shared by every Provider's exchange/refresh adapter.
// Public re-exports live on features/integrations/provider.ts so callers
// import { ExchangeEnv, TokenRecord, ... } from the feature surface.

import type { SignalProvider } from "#/shared/signal";

export type ExchangeEnv = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  JIRA_CLIENT_ID?: string;
  JIRA_CLIENT_SECRET?: string;
  AUTH_PROXY_URL: string;
};

export type TokenRecord = {
  provider: SignalProvider;
  account_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

export type RefreshedToken = {
  access_token: string;
  // New refresh token, when the provider rotates it (Atlassian / Linear).
  // `null` means "preserve the stored value" — Google only returns a new
  // refresh_token on the original consent, not on subsequent refreshes.
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
};

export type FetchLike = (
  input: string,
  init?: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;
