# Auth-proxy performs token exchange + Ed25519 envelope handoff

Supersedes the relevant parts of ADR-0001. The auth-proxy is no longer a thin
redirector that hands the OAuth `code` to the user's Worker — it now owns the
full kickoff (`/start/<provider>`), holds the project's `client_id` /
`client_secret` for every provider, redeems the `code` for a token itself, and
forwards the token to the user's Worker inside a short-lived Ed25519-signed
envelope. The user's Worker never touches a provider `client_secret`. Tokens
still live only in the user's own Supabase; the proxy stays stateless.

## Considered options

- **Keep ADR-0001's flow (proxy redirects `code`, user-Worker exchanges).**
  Forces every self-hoster to register their own GitHub/Google/Slack OAuth
  apps and paste five `client_id`/`client_secret` pairs into their Worker
  before the "Connect" button does anything — exactly the multi-hour
  onboarding chore ADR-0001 was supposed to avoid. Rejected.
- **HMAC-sign the envelope with `STATE_HMAC_SECRET`.** Simpler than
  asymmetric crypto, but every user-Worker would need the proxy's signing
  secret to verify envelopes. A leaked user-Worker would be able to forge
  envelopes for every other user-Worker. Rejected: the threat model needs
  many verifiers and exactly one signer.
- **JWT/JWS over Ed25519.** Standard, but the payload is internal, the only
  consumer is our own user-Worker, and the JWT framing buys nothing the
  existing `<b64url(payload)>.<b64url(sig)>` wire format already gives us.
  Rejected as over-engineering.
- **Publish the verification key via `/.well-known/jwks.json`.** Online
  rotation, but adds a fetch + caching dependency on every user-Worker
  startup. Rejected for v1: ship the public key as a wrangler var, revisit
  if rotation needs to be online.

## Decision

- **Project-owned OAuth apps.** Clearday-the-project registers one OAuth app
  per provider against `<AUTH_PROXY_URL>/callback/<provider>`. The
  `client_id`/`client_secret` for every provider live as wrangler vars on the
  auth-proxy Worker only. Self-hosters configure exactly one new env var
  (`AUTH_PROXY_URL`) plus the published `ENVELOPE_PUBLIC_KEY`.
- **Proxy owns kickoff + exchange.** `/start/<provider>?backend=<https-url>`
  builds a per-provider authorize URL from `oauth-scopes.ts` and signs a
  short-lived `state`. `/callback/<provider>` verifies state, calls the
  per-provider redeem branch in `oauth-exchange.ts`, and builds an envelope.
  The proxy holds no DB / KV / DO state.
- **Ed25519 envelope.** Wire format
  `<b64url(payloadJSON)>.<b64url(signature)>` (matches `oauth-state` for
  debuggability). Payload: `{provider, access_token?, refresh_token?,
  expires_at?, scope?, account_id?, metadata?, backendUrl, return_to?, exp,
  error?, error_description?}`. 120-second TTL — the envelope only needs to
  survive one 302. The success-only fields (`access_token`, `scope`,
  `account_id`) are optional on the type so the same wire format and
  signature path round-trip both success and error envelopes; the user-Worker
  enforces success-required-fields at the call site.
- **User-Worker `/oauth/exchange` is now verify-and-persist.** Reads
  `?envelope=<signed>`, verifies against `ENVELOPE_PUBLIC_KEY`, upserts into
  `provider_accounts`, and 302s to a sanitized same-origin `return_to` (or
  `/today`). Per-provider `*_CLIENT_ID` / `*_CLIENT_SECRET` env vars are
  retired from the user-Worker checklist as each slice lands.
- **Provider errors surface as signed error envelopes.** `?error=access_denied`
  on the callback or a token-exchange 4xx are 302'd to the user-Worker as a
  signed error envelope rather than a 400/502 dead end, so the wizard /
  Settings can render a real message.

## Consequences

- The proxy now holds the project's `client_secret` for every provider. A
  proxy compromise leaks the OAuth apps (revocable) and any in-flight codes
  (single-use, short-lived). It still cannot leak persisted tokens — those
  never reach the proxy. This is a strict superset of ADR-0001's existing
  "codes in transit" risk; README documents it.
- Rotating the Ed25519 keypair requires a coordinated proxy + user-Worker
  release (proxy takes both keys during the transition; user-Workers update
  `ENVELOPE_PUBLIC_KEY` at next deploy). Acceptable for v1.
- Adding a provider is a one-line change in `oauth-scopes.ts` plus a redeem
  branch in `oauth-exchange.ts`. No user-Worker change.
- ADR-0001 stays for the deployment-shape rationale (self-hosted + one
  shared stateless Worker). The "proxy 302-redirects the code to the
  backend" paragraph is superseded by this ADR.
