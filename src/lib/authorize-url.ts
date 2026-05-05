// Pure builder for the auth-proxy's /start/<provider> redirect target.
// Validates the provider against the scope table, validates the user-Worker
// `backend` URL is https + parseable, signs a state payload binding
// `{userBackendUrl, nonce}` with the proxy's HMAC secret, and assembles the
// provider's authorize URL with the project's client_id, the scope-table
// scopes, and `redirect_uri = <AUTH_PROXY_URL>/callback/<provider>`.
//
// No `fetch`, no I/O — the auth-proxy handler calls this and 302s to the URL.

import {
  AUTHORIZE_PROVIDERS,
  type AuthorizeProvider,
  isAuthorizeProvider,
} from "#/lib/oauth-scopes";
import { signState } from "#/lib/oauth-state";

export type AuthorizeEnv = {
  GITHUB_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  SLACK_CLIENT_ID?: string;
  LINEAR_CLIENT_ID?: string;
  STATE_HMAC_SECRET: string;
  /** The auth-proxy's own public URL, used to derive the redirect_uri. */
  AUTH_PROXY_URL: string;
};

export type AuthorizeBuildResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error:
        | "unknown_provider"
        | "missing_backend"
        | "invalid_backend"
        | "non_https_backend"
        | "missing_client_id";
    };

export async function buildAuthorizeUrl(
  provider: string,
  backendUrl: string | null,
  env: AuthorizeEnv,
  now: number = Math.floor(Date.now() / 1000),
  randomNonce: () => string = defaultNonce,
): Promise<AuthorizeBuildResult> {
  if (!isAuthorizeProvider(provider)) {
    return { ok: false, error: "unknown_provider" };
  }
  if (!backendUrl) return { ok: false, error: "missing_backend" };
  let parsedBackend: URL;
  try {
    parsedBackend = new URL(backendUrl);
  } catch {
    return { ok: false, error: "invalid_backend" };
  }
  if (parsedBackend.protocol !== "https:") {
    return { ok: false, error: "non_https_backend" };
  }
  const clientId = clientIdFor(provider, env);
  if (!clientId) return { ok: false, error: "missing_client_id" };

  const config = AUTHORIZE_PROVIDERS[provider];
  const state = await signState(
    { userBackendUrl: parsedBackend.toString(), nonce: randomNonce() },
    env.STATE_HMAC_SECRET,
    now,
  );
  const redirectUri = `${stripTrailingSlash(env.AUTH_PROXY_URL)}/callback/${provider}`;
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set(
    config.scopeParam,
    config.scopes.join(config.scopeSeparator),
  );
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  for (const [k, v] of Object.entries(config.extraParams)) {
    url.searchParams.set(k, v);
  }
  return { ok: true, url: url.toString() };
}

function clientIdFor(
  provider: AuthorizeProvider,
  env: AuthorizeEnv,
): string | undefined {
  switch (provider) {
    case "github":
      return env.GITHUB_CLIENT_ID;
    case "google":
      return env.GOOGLE_CLIENT_ID;
    case "slack":
      return env.SLACK_CLIENT_ID;
    case "linear":
      return env.LINEAR_CLIENT_ID;
  }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function defaultNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
