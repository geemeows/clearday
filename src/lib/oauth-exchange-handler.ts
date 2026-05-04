// HTTP handler for the per-user Worker side of the OAuth callback. The
// auth-proxy 302-redirects the browser here with `code`, `provider`, and the
// original signed `state`. Re-verifying the state here closes the gap that
// would otherwise let any caller hit /oauth/exchange with a chosen `code`.

import {
  type ExchangeEnv,
  ExchangeError,
  exchangeCode,
  type FetchLike,
  type Provider,
  type TokenRecord,
} from "#/lib/oauth-exchange";
import { verifyState } from "#/lib/oauth-state";

const KNOWN_PROVIDERS: ReadonlySet<Provider> = new Set([
  "github",
  "google",
  "slack",
]);

export type OAuthExchangeEnv = ExchangeEnv & {
  STATE_HMAC_SECRET: string;
};

export type PersistTokens = (record: TokenRecord) => Promise<void>;

export async function handleOAuthExchange(
  request: Request,
  env: OAuthExchangeEnv,
  deps: { fetch: FetchLike; persist: PersistTokens },
  now: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider");
  const state = url.searchParams.get("state");
  if (!code || !provider || !state) {
    return text("missing code, provider, or state", 400);
  }
  if (!isKnownProvider(provider)) {
    return text(`unknown provider: ${provider}`, 400);
  }
  const verified = await verifyState(state, env.STATE_HMAC_SECRET, now);
  if (!verified.ok) {
    return text(`invalid state: ${verified.reason}`, 400);
  }
  let record: TokenRecord;
  try {
    record = await exchangeCode(provider, code, env, deps.fetch);
  } catch (err) {
    if (err instanceof ExchangeError) {
      return text(`${provider} exchange failed: ${err.message}`, 502);
    }
    throw err;
  }
  await deps.persist(record);
  return new Response(null, {
    status: 302,
    headers: { location: `/settings?connected=${provider}` },
  });
}

function isKnownProvider(p: string): p is Provider {
  return KNOWN_PROVIDERS.has(p as Provider);
}

function text(body: string, status: number): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
