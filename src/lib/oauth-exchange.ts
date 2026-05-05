// Per-provider code→token exchange for the per-user Worker side of the OAuth
// flow. The auth-proxy 302-redirects the browser to /oauth/exchange with
// `code`, `provider`, and the original signed `state`. The handler verifies
// the state, calls the matching provider exchange, and returns a normalized
// token record for persistence.

export type Provider = "github" | "google" | "slack" | "linear" | "jira";

export type ExchangeEnv = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  JIRA_CLIENT_ID?: string;
  JIRA_CLIENT_SECRET?: string;
  AUTH_PROXY_URL: string;
};

export type TokenRecord = {
  provider: Provider;
  account_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
};

export type FetchLike = (
  input: string,
  init?: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export class ExchangeError extends Error {
  constructor(
    public readonly provider: Provider,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExchangeError";
  }
}

export function redirectUri(env: ExchangeEnv, provider: Provider): string {
  return `${stripTrailingSlash(env.AUTH_PROXY_URL)}/callback/${provider}`;
}

export type RefreshedToken = {
  access_token: string;
  /**
   * New refresh token, when the provider rotates it (Atlassian / Linear).
   * `null` means "preserve the stored value" — Google only returns a new
   * refresh_token on the original consent, not on subsequent refreshes.
   */
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
};

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

export async function exchangeCode(
  provider: Provider,
  code: string,
  env: ExchangeEnv,
  fetchImpl: FetchLike,
): Promise<TokenRecord> {
  switch (provider) {
    case "github":
      return exchangeGithub(code, env, fetchImpl);
    case "google":
      return exchangeGoogle(code, env, fetchImpl);
    case "slack":
      return exchangeSlack(code, env, fetchImpl);
    case "linear":
      return exchangeLinear(code, env, fetchImpl);
    case "jira":
      return exchangeJira(code, env, fetchImpl);
  }
}

async function exchangeGithub(
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
  return {
    provider: "github",
    account_id: null,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, ","),
    metadata: {},
  };
}

async function exchangeGoogle(
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
  return {
    provider: "google",
    account_id: null,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
    metadata: body.id_token ? { id_token: body.id_token } : {},
  };
}

async function exchangeSlack(
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
    access_token?: string;
    scope?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string; access_token?: string; scope?: string };
  };
  if (!res.ok || body.ok === false || !body.access_token) {
    throw new ExchangeError(
      "slack",
      res.status,
      body.error || "slack exchange failed",
    );
  }
  return {
    provider: "slack",
    account_id: body.authed_user?.id ?? null,
    access_token: body.access_token,
    refresh_token: null,
    expires_at: null,
    scopes: parseScope(body.scope, ","),
    metadata: {
      team: body.team ?? null,
      authed_user: body.authed_user ?? null,
    },
  };
}

async function exchangeLinear(
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
  return {
    provider: "linear",
    account_id: null,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, ","),
    metadata: {},
  };
}

async function exchangeJira(
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
  return {
    provider: "jira",
    account_id: null,
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? null,
    expires_at: expiresAtFrom(body.expires_in),
    scopes: parseScope(body.scope, " "),
    metadata: {},
  };
}

function expiresAtFrom(expiresIn: number | undefined): string | null {
  if (typeof expiresIn !== "number") return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function parseScope(scope: string | undefined, sep: string): string[] {
  if (!scope) return [];
  return scope
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
