// Linear OAuth code→token exchange + refresh. Account id comes from a
// follow-up `viewer { id }` GraphQL query.

import { ExchangeError } from "#/features/integrations/oauth/errors";
import {
  expiresAtFrom,
  parseScope,
  redirectUri,
  safeText,
} from "#/features/integrations/oauth/helpers";
import type {
  ExchangeEnv,
  FetchLike,
  RefreshedToken,
  TokenRecord,
} from "#/features/integrations/oauth/types";

export async function exchangeLinear(
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  if (!env.LINEAR_CLIENT_ID || !env.LINEAR_CLIENT_SECRET) {
    throw new ExchangeError("linear", 500, "linear client credentials missing");
  }
  const res = await fetchImpl("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(env, "linear"),
      grant_type: "authorization_code",
    }).toString(),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new ExchangeError(
      "linear",
      res.status,
      body.error_description || body.error || "linear exchange failed",
    );
  }
  const accountId = await fetchLinearAccountId(body.access_token, fetchImpl);
  return {
    provider: "linear",
    account_id: accountId,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, ","),
    metadata: {},
  };
}

export async function refreshLinearToken(
  refreshToken: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<RefreshedToken> {
  if (!env.LINEAR_CLIENT_ID || !env.LINEAR_CLIENT_SECRET) {
    throw new ExchangeError("linear", 500, "linear client credentials missing");
  }
  const res = await fetchImpl("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.LINEAR_CLIENT_ID,
      client_secret: env.LINEAR_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new ExchangeError(
      "linear",
      res.status,
      body.error_description || body.error || "linear refresh failed",
    );
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, ","),
  };
}

async function fetchLinearAccountId(
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: "{ viewer { id } }" }),
  });
  if (!res.ok) {
    throw new ExchangeError(
      "linear",
      res.status,
      `linear viewer query failed: ${await safeText(res)}`,
    );
  }
  const body = (await res.json()) as {
    data?: { viewer?: { id?: string } };
  };
  const id = body.data?.viewer?.id;
  if (!id) {
    throw new ExchangeError(
      "linear",
      res.status,
      "linear viewer query missing id",
    );
  }
  return id;
}
