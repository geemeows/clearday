// Stateless OAuth callback handler for the project-run auth-proxy Worker.
// Verifies the signed `state`, then 302-redirects the provider's `code`
// onward to the user's own backend, which performs the token exchange.
// Never persists the code or token; never reads/writes storage.

import { verifyState } from "#/lib/oauth-state";

export type AuthProxyEnv = {
  STATE_HMAC_SECRET: string;
};

const KNOWN_PROVIDERS = new Set(["github", "google", "slack"]);
const TEXT_HEADERS = { "content-type": "text/plain; charset=utf-8" };

export async function handleAuthProxyRequest(
  request: Request,
  env: AuthProxyEnv,
  now: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/callback\/([^/]+)\/?$/);
  if (!match) {
    return text("not found", 404);
  }
  const provider = match[1];
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
