// Google OAuth code→token exchange + refresh. Account id is the `sub` claim
// of the id_token; we require a refresh_token (offline access) on first
// consent so the orchestrator can rotate access tokens later.

import { ExchangeError } from "#/features/integrations/oauth/errors";
import {
  b64urlDecodeToString,
  expiresAtFrom,
  parseScope,
  redirectUri,
} from "#/features/integrations/oauth/helpers";
import type {
  ExchangeEnv,
  FetchLike,
  RefreshedToken,
  TokenRecord,
} from "#/features/integrations/oauth/types";

export async function exchangeGoogle(
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(env, "google"),
      grant_type: "authorization_code",
    }).toString(),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new ExchangeError(
      "google",
      res.status,
      body.error_description || body.error || "google exchange failed",
    );
  }
  if (!body.refresh_token) {
    throw new ExchangeError(
      "google",
      res.status,
      "google response missing refresh_token (offline access requested)",
    );
  }
  if (!body.id_token) {
    throw new ExchangeError(
      "google",
      res.status,
      "google response missing id_token",
    );
  }
  const accountId = decodeGoogleSub(body.id_token);
  return {
    provider: "google",
    account_id: accountId,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
    metadata: { id_token: body.id_token },
  };
}

export async function refreshGoogleToken(
  refreshToken: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<RefreshedToken> {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new ExchangeError(
      "google",
      res.status,
      body.error_description || body.error || "google refresh failed",
    );
  }
  return {
    access_token: body.access_token,
    refresh_token: null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
  };
}

function decodeGoogleSub(idToken: string): string {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new ExchangeError("google", 0, "google id_token malformed");
  }
  let json: string;
  try {
    json = b64urlDecodeToString(parts[1]);
  } catch {
    throw new ExchangeError(
      "google",
      0,
      "google id_token payload not base64url",
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new ExchangeError("google", 0, "google id_token payload not JSON");
  }
  const sub = (payload as { sub?: unknown })?.sub;
  if (typeof sub !== "string" || !sub) {
    throw new ExchangeError("google", 0, "google id_token missing sub");
  }
  return sub;
}
