// HTTP handler for the per-user Worker side of the OAuth callback. The
// auth-proxy 302-redirects the browser here with `?envelope=<signed>`. The
// envelope is an Ed25519-signed payload carrying the freshly-exchanged
// provider token plus metadata; the user-Worker verifies it against the
// proxy's published public key, then upserts into `provider_accounts` and
// redirects to `return_to` (default `/today`).

import type { Provider, TokenRecord } from "#/lib/oauth-exchange";
import { verifyEnvelope } from "#/shared/oauth/envelope";

const KNOWN_PROVIDERS: ReadonlySet<Provider> = new Set([
  "github",
  "google",
  "slack",
  "linear",
  "jira",
]);

export type OAuthExchangeEnv = {
  ENVELOPE_PUBLIC_KEY: string;
};

export type PersistTokens = (record: TokenRecord) => Promise<void>;

export async function handleOAuthExchange(
  request: Request,
  env: OAuthExchangeEnv,
  deps: { persist: PersistTokens },
  now: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  const envelope = url.searchParams.get("envelope");
  if (!envelope) return text("missing envelope", 400);
  const verified = await verifyEnvelope(envelope, env.ENVELOPE_PUBLIC_KEY, now);
  if (!verified.ok) {
    return text(`invalid envelope: ${verified.reason}`, 400);
  }
  const { payload } = verified;
  if (!isKnownProvider(payload.provider)) {
    return text(`unknown provider: ${payload.provider}`, 400);
  }
  const base = sanitizeReturnTo(payload.return_to ?? null);
  if (payload.error) {
    // Provider denied or exchange failed on the proxy. Skip persist, surface
    // the error code/description to the wizard or settings landing.
    const location = appendQuery(base, {
      oauth_error: payload.error,
      oauth_provider: payload.provider,
      oauth_error_description: payload.error_description ?? null,
    });
    return new Response(null, { status: 302, headers: { location } });
  }
  if (
    typeof payload.access_token !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.account_id !== "string"
  ) {
    return text("invalid envelope: malformed", 400);
  }
  const record: TokenRecord = {
    provider: payload.provider,
    account_id: payload.account_id || null,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? null,
    expires_at: unixToIso(payload.expires_at ?? null),
    scopes: parseScope(payload.scope),
    metadata: payload.metadata ?? {},
  };
  await deps.persist(record);
  return new Response(null, { status: 302, headers: { location: base } });
}

function appendQuery(
  pathAndQuery: string,
  params: Record<string, string | null>,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => typeof v === "string" && v.length > 0,
  ) as [string, string][];
  if (entries.length === 0) return pathAndQuery;
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${pathAndQuery}${sep}${qs}`;
}

function isKnownProvider(p: string): p is Provider {
  return KNOWN_PROVIDERS.has(p as Provider);
}

function parseScope(scope: string): string[] {
  if (!scope) return [];
  // Providers vary on separator; both comma and space are normalized away by
  // the proxy-side scope-join, but accept either here for safety.
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function unixToIso(unix: number | null): string | null {
  if (unix == null) return null;
  return new Date(unix * 1000).toISOString();
}

function sanitizeReturnTo(returnTo: string | null): string {
  // Only allow same-origin paths; reject anything that would escape the
  // user-Worker (absolute URLs, protocol-relative, backslash tricks).
  if (!returnTo) return "/today";
  if (!returnTo.startsWith("/")) return "/today";
  if (returnTo.startsWith("//") || returnTo.startsWith("/\\")) return "/today";
  return returnTo;
}

function text(body: string, status: number): Response {
  return new Response(`${body}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
