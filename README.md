# Clearday

Open-source, self-hosted command center for software engineers. Each user runs
their own Supabase project + Cloudflare Worker; the Clearday project itself
operates only a stateless OAuth auth-proxy so users don't have to register
their own OAuth apps with each provider.

See `CONTEXT.md` for the domain model and `docs/adr/` for architectural
decisions — in particular ADR-0003 for the current OAuth flow (which
supersedes the original ADR-0001 sketch).

## Self-hosting

Clearday is designed to be self-hosted. Two supported paths: use the
project-run auth-proxy (no OAuth app registration needed) or run your own
(full control). Step-by-step setup — Supabase, Worker secrets, Cloudflare
deploy, first login, troubleshooting — is in
[`docs/self-host.md`](docs/self-host.md).

The remaining sections below describe the OAuth flow and project-maintainer
ops; self-hosters can read them for context but only need to follow the
self-hosting guide.

## OAuth via the shared auth-proxy

Clearday-the-project registers one OAuth app per provider against
`https://auth.clearday.geemeows.com/callback/<provider>` and operates a
stateless Cloudflare Worker (the **auth-proxy**) that owns the entire OAuth
kickoff: it builds the authorize URL, redeems the `code` for a token, and
forwards the token to the user's Worker inside a short-lived Ed25519-signed
envelope. The user's Worker never holds any provider's `client_secret`.

### Flow

1. User clicks "Connect GitHub" in the SPA. The user's Worker returns a
   connect URL of the form
   `<AUTH_PROXY_URL>/start/<provider>?backend=<userWorkerUrl>`.
2. Auth-proxy `/start/<provider>` validates `backend` (https + parseable),
   looks up scopes + extras from the per-provider scope table, signs a short
   `state` binding `{userBackendUrl, nonce}` with `STATE_HMAC_SECRET`, and
   302s to the provider's authorize URL with the project's `client_id` and
   `redirect_uri = <AUTH_PROXY_URL>/callback/<provider>`.
3. Provider redirects back to `<AUTH_PROXY_URL>/callback/<provider>` with
   `code` + `state`.
4. Auth-proxy `/callback/<provider>` verifies the state, exchanges the code
   for a token using the project's `client_secret`, derives a stable
   `account_id` (e.g. GitHub `/user.id`, Google `id_token.sub`, Slack
   `authed_user.id`), signs an Ed25519 envelope
   (`{provider, access_token, refresh_token?, expires_at?, scope, account_id,
   metadata?, backendUrl, return_to?, exp}`), and 302s to
   `<userBackendUrl>/oauth/exchange?envelope=<signed>`.
5. The user's Worker verifies the envelope against `ENVELOPE_PUBLIC_KEY`,
   upserts into `provider_accounts`, and redirects the user to a same-origin
   `return_to` (or `/today`).

Provider denials (`?error=access_denied`) and exchange failures are surfaced
as signed **error envelopes** with the same wire format, so the SPA can
render a real message instead of a generic 400/502.

### Per-provider scopes

Source of truth: `src/lib/oauth-scopes.ts` (one entry per provider). Adding
or widening a scope is a one-line change there.

| Provider | Authorize endpoint | v1 scopes |
| --- | --- | --- |
| GitHub | `https://github.com/login/oauth/authorize` | `read:user repo` |
| Google | `https://accounts.google.com/o/oauth2/v2/auth` (with `access_type=offline&prompt=consent`) | `openid https://www.googleapis.com/auth/calendar.readonly` |
| Slack  | `https://slack.com/oauth/v2/authorize` | user_scope: `channels:read,groups:read,im:read,mpim:read,search:read` |
| Linear | `https://linear.app/oauth/authorize` (with `prompt=consent`) | `read` |

### Required wrangler vars

**Auth-proxy** (held only by the project maintainer):

- `AUTH_PROXY_URL` — the proxy's own canonical URL (used to build
  `redirect_uri` so non-canonical hostnames don't break OAuth registration).
- `STATE_HMAC_SECRET` — HMAC secret for the kickoff `state` value.
- `ENVELOPE_PRIVATE_KEY`, `ENVELOPE_PUBLIC_KEY` — base64url-encoded raw
  32-byte Ed25519 keypair. Mint with `generateEnvelopeKeypair()` from
  `src/lib/oauth-envelope.ts`.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` (optional — only required if Linear is wired into a deployment)

**Per-user Worker** (what self-hosters configure):

- `AUTH_PROXY_URL` — points at the project-run proxy (defaults to
  `https://auth.clearday.geemeows.com`).
- `ENVELOPE_PUBLIC_KEY` — the proxy's published Ed25519 public key. Used
  only to verify incoming envelopes; no `client_secret` lives on this side.
- `SUPABASE_SERVICE_ROLE_KEY` — for the `/oauth/exchange` upsert.

Self-hosters do **not** register their own OAuth apps and do **not** paste
any provider `client_id` / `client_secret`. The Slack and Google pairs on
the user-Worker (formerly required for the legacy "user-Worker exchanges
code" flow) are being retired as each slice lands; see `OPTIONAL_ENV_VARS`
in `src/lib/self-host-api.ts` for the current state of the operator-facing
checklist.

## Project-maintainer ops: registering / rotating the OAuth apps

For each provider:

1. Register one OAuth app under the Clearday project's account with
   `redirect_uri = <AUTH_PROXY_URL>/callback/<provider>` and the v1 scopes
   above. The provider's developer console is where the app lives:
   - GitHub: <https://github.com/settings/developers> → "New OAuth App".
   - Google: <https://console.cloud.google.com/apis/credentials> → "OAuth
     2.0 Client ID" (Web application). Add the redirect URI under
     "Authorized redirect URIs".
   - Slack: <https://api.slack.com/apps> → "Create New App" → "From
     scratch", then "OAuth & Permissions" to set the redirect URI and
     `User Token Scopes`.
2. Set the resulting `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET`
   as wrangler secrets on the auth-proxy Worker. They never reach
   user-Workers.
3. Rotating a `client_secret` is a one-step op: re-issue in the provider
   console, update the auth-proxy secret, redeploy. No user-Worker change
   is needed.
4. Rotating the Ed25519 keypair requires a coordinated release: generate a
   new keypair with `generateEnvelopeKeypair()`, update the proxy's
   `ENVELOPE_PRIVATE_KEY`/`ENVELOPE_PUBLIC_KEY`, then ship a release that
   bumps `ENVELOPE_PUBLIC_KEY` on every user-Worker.

## Trust note

The proxy briefly sees authorization codes and freshly-exchanged provider
tokens in transit while building the envelope. It never persists them —
tokens reach durable storage only inside the user's own Supabase. A proxy
compromise can leak the registered OAuth apps (revocable) and any in-flight
codes (single-use, short-lived). It cannot leak persisted tokens.
