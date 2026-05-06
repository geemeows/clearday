// GitHub OAuth code→token exchange. GitHub doesn't issue refresh tokens for
// the OAuth Apps flow, so there's no `refresh` here — the Provider sets
// `refresh: null`. Account id comes from a follow-up GET /user.

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
  TokenRecord,
} from "#/features/integrations/oauth/types";

export async function exchangeGithub(
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(env, "github"),
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
  if (!res.ok || body.error || !body.access_token) {
    throw new ExchangeError(
      "github",
      res.status,
      body.error_description || body.error || "github exchange failed",
    );
  }
  const accountId = await fetchGithubAccountId(body.access_token, fetchImpl);
  return {
    provider: "github",
    account_id: accountId,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, ","),
    metadata: {},
  };
}

async function fetchGithubAccountId(
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl("https://api.github.com/user", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "clearday-auth-proxy",
    },
  });
  if (!res.ok) {
    throw new ExchangeError(
      "github",
      res.status,
      `github /user failed: ${await safeText(res)}`,
    );
  }
  const body = (await res.json()) as { id?: number; login?: string };
  if (typeof body.id !== "number") {
    throw new ExchangeError("github", res.status, "github /user missing id");
  }
  return String(body.id);
}
