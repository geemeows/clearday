// Stateless OAuth handler for the project-run auth-proxy Worker.
//
// `/start/:provider` builds the provider's authorize URL using the project's
// client_id from the scope table and 302s the browser to the provider. The
// signed `state` carries the user's backend URL through to the callback.
//
// `/callback/:provider` verifies the signed `state`, exchanges the provider's
// `code` for a token using the project's client_secret, and 302-redirects the
// browser to `<userBackendUrl>/oauth/exchange?envelope=<ed25519-signed>`. The
// user-Worker verifies the envelope against the proxy's published public key
// and persists the token. The proxy never reads/writes storage and never
// hands the raw code or token to the user-Worker.

import { type AuthorizeEnv, buildAuthorizeUrl } from "#/lib/authorize-url";
import {
  type EnvelopeKeypair,
  type EnvelopePayload,
  signEnvelope,
} from "#/lib/oauth-envelope";
import {
  type ExchangeEnv,
  ExchangeError,
  exchangeCode,
  type FetchLike,
  type Provider,
  type TokenRecord,
} from "#/lib/oauth-exchange";
import { verifyState } from "#/lib/oauth-state";

export type AuthProxyEnv = AuthorizeEnv &
  ExchangeEnv & {
    STATE_HMAC_SECRET: string;
    ENVELOPE_PRIVATE_KEY: string;
    ENVELOPE_PUBLIC_KEY: string;
  };

export type AuthProxyDeps = { fetch: FetchLike };

const KNOWN_PROVIDERS: ReadonlySet<Provider> = new Set([
  "github",
  "google",
  "slack",
  "linear",
  "jira",
]);
const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function handleAuthProxyRequest(
  request: Request,
  env: AuthProxyEnv,
  deps: AuthProxyDeps,
  now: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  const startMatch = url.pathname.match(/^\/start\/([^/]+)\/?$/);
  if (startMatch) {
    return handleStart(startMatch[1], url, env, now);
  }
  const callbackMatch = url.pathname.match(/^\/callback\/([^/]+)\/?$/);
  if (callbackMatch) {
    return handleCallback(callbackMatch[1], url, env, deps, now);
  }
  return text("not found", 404);
}

async function handleStart(
  provider: string,
  url: URL,
  env: AuthProxyEnv,
  now: number,
): Promise<Response> {
  const backend = url.searchParams.get("backend");
  const out = await buildAuthorizeUrl(provider, backend, env, now);
  if (!out.ok) {
    return text(`/start error: ${out.error}`, 400);
  }
  return Response.redirect(out.url, 302);
}

async function handleCallback(
  provider: string,
  url: URL,
  env: AuthProxyEnv,
  deps: AuthProxyDeps,
  now: number,
): Promise<Response> {
  if (!isKnownProvider(provider)) {
    return text(`unknown provider: ${provider}`, 400);
  }
  const state = url.searchParams.get("state");
  if (!state) {
    return text("missing state", 400);
  }
  const result = await verifyState(state, env.STATE_HMAC_SECRET, now);
  if (!result.ok) {
    return text(`invalid state: ${result.reason}`, 400);
  }
  let target: URL;
  try {
    target = new URL("/oauth/exchange", result.payload.userBackendUrl);
  } catch {
    return text("invalid backend url", 400);
  }
  if (target.protocol !== "https:") {
    return text("backend url must be https", 400);
  }
  const keys: EnvelopeKeypair = {
    publicKey: env.ENVELOPE_PUBLIC_KEY,
    privateKey: env.ENVELOPE_PRIVATE_KEY,
  };
  const backendUrl = result.payload.userBackendUrl;

  // Provider denied or otherwise short-circuited the consent screen — e.g.
  // `?error=access_denied`. Surface to the user-Worker as a signed error
  // envelope rather than a 400 so the user sees a real message.
  const providerError = url.searchParams.get("error");
  if (providerError) {
    const envelope = await buildErrorEnvelope({
      provider,
      backendUrl,
      error: providerError,
      error_description: url.searchParams.get("error_description"),
      keys,
      now,
    });
    target.searchParams.set("envelope", envelope);
    return Response.redirect(target.toString(), 302);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return text("missing code", 400);
  }
  let record: TokenRecord;
  try {
    record = await exchangeCode(provider, code, env, deps.fetch);
  } catch (err) {
    if (err instanceof ExchangeError) {
      const envelope = await buildErrorEnvelope({
        provider,
        backendUrl,
        error: "exchange_failed",
        error_description: err.message,
        keys,
        now,
      });
      target.searchParams.set("envelope", envelope);
      return Response.redirect(target.toString(), 302);
    }
    throw err;
  }
  const payload: Omit<EnvelopePayload, "exp"> = {
    provider,
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    expires_at: expiresAtToUnix(record.expires_at),
    scope: record.scopes.join(","),
    account_id: record.account_id ?? "",
    backendUrl,
  };
  const envelope = await signEnvelope(payload, keys, { now });
  target.searchParams.set("envelope", envelope);
  return Response.redirect(target.toString(), 302);
}

async function buildErrorEnvelope(args: {
  provider: string;
  backendUrl: string;
  error: string;
  error_description: string | null;
  keys: EnvelopeKeypair;
  now: number;
}): Promise<string> {
  const payload: Omit<EnvelopePayload, "exp"> = {
    provider: args.provider,
    backendUrl: args.backendUrl,
    error: args.error,
    error_description: args.error_description,
  };
  return signEnvelope(payload, args.keys, { now: args.now });
}

function isKnownProvider(p: string): p is Provider {
  return KNOWN_PROVIDERS.has(p as Provider);
}

function expiresAtToUnix(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function text(body: string, status: number): Response {
  return new Response(`${body}\n`, { status, headers: TEXT_HEADERS });
}
