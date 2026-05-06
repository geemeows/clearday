// Jira (Atlassian) OAuth code→token exchange + refresh. Atlassian uses JSON
// bodies (not form-encoded) and rotates refresh tokens. Account id comes from
// a follow-up GET /me on api.atlassian.com.

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

export async function exchangeJira(
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  if (!env.JIRA_CLIENT_ID || !env.JIRA_CLIENT_SECRET) {
    throw new ExchangeError("jira", 500, "jira client credentials missing");
  }
  const res = await fetchImpl("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(env, "jira"),
    }),
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
      "jira",
      res.status,
      body.error_description || body.error || "jira exchange failed",
    );
  }
  const accountId = await fetchJiraAccountId(body.access_token, fetchImpl);
  return {
    provider: "jira",
    account_id: accountId,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
    metadata: {},
  };
}

export async function refreshJiraToken(
  refreshToken: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<RefreshedToken> {
  if (!env.JIRA_CLIENT_ID || !env.JIRA_CLIENT_SECRET) {
    throw new ExchangeError("jira", 500, "jira client credentials missing");
  }
  const res = await fetchImpl("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
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
      "jira",
      res.status,
      body.error_description || body.error || "jira refresh failed",
    );
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
  };
}

async function fetchJiraAccountId(
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl("https://api.atlassian.com/me", {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new ExchangeError(
      "jira",
      res.status,
      `jira /me failed: ${await safeText(res)}`,
    );
  }
  const body = (await res.json()) as { account_id?: unknown };
  if (typeof body.account_id !== "string" || !body.account_id) {
    throw new ExchangeError("jira", res.status, "jira /me missing account_id");
  }
  return body.account_id;
}
