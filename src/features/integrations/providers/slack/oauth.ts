// Slack OAuth code→token exchange. v1 only requests user-token scopes, so the
// user token (xoxp-…) lives under `authed_user.access_token` rather than the
// top-level `access_token` (which is the bot token, only present when bot
// scopes are requested). Slack tokens don't expire and can't be refreshed
// here; the Provider sets `refresh: null`.

import { ExchangeError } from "#/features/integrations/oauth/errors";
import { parseScope, redirectUri } from "#/features/integrations/oauth/helpers";
import type {
  ExchangeEnv,
  FetchLike,
  TokenRecord,
} from "#/features/integrations/oauth/types";

export async function exchangeSlack(
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  const res = await fetchImpl("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(env, "slack"),
    }).toString(),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string; access_token?: string; scope?: string };
  };
  if (!res.ok || body.ok === false) {
    throw new ExchangeError(
      "slack",
      res.status,
      body.error || "slack exchange failed",
    );
  }
  const userToken = body.authed_user?.access_token;
  if (!userToken) {
    throw new ExchangeError(
      "slack",
      res.status,
      "slack response missing authed_user.access_token",
    );
  }
  const accountId = await fetchSlackAccountId(userToken, fetchImpl);
  return {
    provider: "slack",
    account_id: accountId,
    access_token: userToken,
    refresh_token: null,
    expires_at: null,
    scopes: parseScope(body.authed_user?.scope, ","),
    metadata: {
      team: body.team ?? null,
    },
  };
}

async function fetchSlackAccountId(
  userToken: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const res = await fetchImpl("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      authorization: `Bearer ${userToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    user_id?: string;
  };
  if (!res.ok || body.ok === false || !body.user_id) {
    throw new ExchangeError(
      "slack",
      res.status,
      body.error || "slack auth.test failed",
    );
  }
  return body.user_id;
}
