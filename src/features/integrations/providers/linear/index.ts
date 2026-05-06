// Linear provider — read-only ingest of issues assigned to the authed user.
// v1: no capabilities (no write actions).

import type { Provider } from "#/features/integrations/provider";
import { pollLinearSignals } from "#/features/integrations/providers/linear/poll";
import { exchangeLinear, refreshLinearToken } from "#/lib/oauth-exchange";
import { AUTHORIZE_PROVIDERS } from "#/shared/oauth/scopes";

export const linear: Provider = {
  id: "linear",
  authorize: AUTHORIZE_PROVIDERS.linear,
  exchange: (code, env, fetchImpl) => exchangeLinear(code, env, fetchImpl),
  refresh: (refreshToken, env, fetchImpl) =>
    refreshLinearToken(refreshToken, env, fetchImpl),
  poll: async (token, ctx) => {
    const signals = await pollLinearSignals(token, async (url, init) =>
      ctx.fetch(url, init),
    );
    return { signals, delta: undefined };
  },
  capabilities: {},
};
