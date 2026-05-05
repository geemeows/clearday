// Stateless OAuth handler for the project-run auth-proxy Worker.
//
// `/start/:provider` builds the provider's authorize URL using the project's
// client_id from the scope table and 302s the browser to the provider. The
// signed `state` carries the user's backend URL through to the callback.
//
// `/callback/:provider` verifies the signed `state`, then 302-redirects the
// provider's `code` onward to the user's own backend, which performs the
// token exchange. Never persists the code or token; never reads/writes
// storage.

import { type AuthorizeEnv, buildAuthorizeUrl } from "#/lib/authorize-url";
import { verifyState } from "#/lib/oauth-state";

export type AuthProxyEnv = AuthorizeEnv & {
  STATE_HMAC_SECRET: string;
};

const KNOWN_PROVIDERS = new Set([
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
  now: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  const startMatch = url.pathname.match(/^\/start\/([^/]+)\/?$/);
  if (startMatch) {
    return handleStart(startMatch[1], url, env, now);
  }
  const callbackMatch = url.pathname.match(/^\/callback\/([^/]+)\/?$/);
  if (callbackMatch) {
    return handleCallback(callbackMatch[1], url, env, now);
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
  now: number,
): Promise<Response> {
  if (!KNOWN_PROVIDERS.has(provider)) {
    return text(`unknown provider: ${provider}`, 400);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return text("missing code or state", 400);
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
  target.searchParams.set("code", code);
  target.searchParams.set("provider", provider);
  // Forward the signed state so the user-Worker can re-verify it. Without this,
  // anyone who can reach /oauth/exchange could trigger a code redemption with
  // a fabricated `code`. Re-verifying the HMAC there closes the gap.
  target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}

function text(body: string, status: number): Response {
  return new Response(`${body}\n`, { status, headers: TEXT_HEADERS });
}
