// Provider registry. The orchestrator iterates Object.values(PROVIDERS); the
// auth-proxy reads AUTHORIZE_CONFIGS to build per-provider authorize URLs;
// route handlers call PROVIDERS.<id>.capabilities.<name>(...).
//
// Adding a new provider = one folder under providers/<id>/ and one entry
// here. No orchestrator change.

import type {
  AuthorizeProviderConfig,
  ExchangeEnv,
  FetchLike,
  Provider,
  ProviderId,
  TokenRecord,
} from "#/features/integrations/provider";
import { github } from "#/features/integrations/providers/github";
import { google } from "#/features/integrations/providers/google";
import { jira } from "#/features/integrations/providers/jira";
import { linear } from "#/features/integrations/providers/linear";
import { slack } from "#/features/integrations/providers/slack";

export type ExchangeFn = (
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
) => Promise<TokenRecord>;

export const PROVIDERS = {
  github,
  google,
  slack,
  linear,
  jira,
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous S/D/C per provider
} as const satisfies Record<ProviderId, Provider<any, any, any>>;

export const AUTHORIZE_CONFIGS: Record<ProviderId, AuthorizeProviderConfig> = {
  github: PROVIDERS.github.authorize,
  google: PROVIDERS.google.authorize,
  slack: PROVIDERS.slack.authorize,
  linear: PROVIDERS.linear.authorize,
  jira: PROVIDERS.jira.authorize,
};

// Slim adapter map for the auth-proxy Worker. Pulling EXCHANGES (instead of
// the full PROVIDERS registry) keeps poll/capability code out of the
// auth-proxy bundle.
export const EXCHANGES: Record<ProviderId, ExchangeFn> = {
  github: PROVIDERS.github.exchange,
  google: PROVIDERS.google.exchange,
  slack: PROVIDERS.slack.exchange,
  linear: PROVIDERS.linear.exchange,
  jira: PROVIDERS.jira.exchange,
};

export function isProviderId(p: string): p is ProviderId {
  return Object.hasOwn(PROVIDERS, p);
}
