// Jira provider — read-only ingest of issues assigned to the authed user
// across all accessible Atlassian sites. v1: no capabilities.

import type { Provider } from "#/features/integrations/provider";
import { pollJiraSignals } from "#/features/integrations/providers/jira/poll";
import { exchangeJira, refreshJiraToken } from "#/lib/oauth-exchange";
import { AUTHORIZE_PROVIDERS } from "#/shared/oauth/scopes";

export const jira: Provider = {
  id: "jira",
  authorize: AUTHORIZE_PROVIDERS.jira,
  exchange: (code, env, fetchImpl) => exchangeJira(code, env, fetchImpl),
  refresh: (refreshToken, env, fetchImpl) =>
    refreshJiraToken(refreshToken, env, fetchImpl),
  poll: async (token, ctx) => {
    const signals = await pollJiraSignals(token, async (url, init) =>
      ctx.fetch(url, init),
    );
    return { signals, delta: undefined };
  },
  capabilities: {},
};
