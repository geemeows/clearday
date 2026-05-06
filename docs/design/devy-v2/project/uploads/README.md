# Clearday

Open-source, self-hosted command center for software engineers. Each user runs
their own Supabase project + Cloudflare Worker; the Clearday project itself
operates only a stateless OAuth auth-proxy so users don't have to register
their own OAuth apps with each provider.

See `CONTEXT.md` for the domain model and `docs/adr/` for architectural
decisions.

## OAuth via the shared auth-proxy

Clearday-the-project registers one OAuth app per provider with redirect URI
`https://auth.clearday.geemeows.com/callback/<provider>` and operates a
stateless Worker (the **auth-proxy**) that 302-redirects the OAuth `code` on to
the user's own Worker, where the actual code→token exchange happens.

### Flow

1. User clicks "Connect GitHub" in the SPA.
2. The user's Worker mints a signed `state` (HMAC-SHA256 over `{userBackendUrl,
   nonce, iat}`) using the shared `STATE_HMAC_SECRET`, and redirects the
   browser to the provider's authorize URL with that `state`.
3. Provider redirects to `https://auth.clearday.geemeows.com/callback/<provider>`
   with `code` + `state`.
4. Auth-proxy verifies the state's HMAC and TTL (10 min), then 302-redirects to
   `<userBackendUrl>/oauth/exchange?code=…&provider=…&state=…`.
5. The user's Worker re-verifies the state, exchanges the code with the
   provider, and upserts tokens into `provider_accounts` (service-role).

### Authorize URLs (per provider)

The user's Worker constructs these. `redirect_uri` is always
`https://auth.clearday.geemeows.com/callback/<provider>` and `state` is the
HMAC-signed payload.

| Provider | Authorize endpoint | v1 scopes (read-only) |
| --- | --- | --- |
| GitHub | `https://github.com/login/oauth/authorize` | `read:user repo` |
| Google | `https://accounts.google.com/o/oauth2/v2/auth` (with `access_type=offline&prompt=consent`) | `openid email https://www.googleapis.com/auth/calendar.readonly` |
| Slack  | `https://slack.com/oauth/v2/authorize` | bot: `channels:history,groups:history,im:history,mpim:history,channels:read,chat:write`; user: `users:read` |

### Required secrets on the per-user Worker

Set with `wrangler secret put`:

- `STATE_HMAC_SECRET` — same value as the auth-proxy.
- `SUPABASE_SERVICE_ROLE_KEY` — used only for the `/oauth/exchange` upsert.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

`AUTH_PROXY_URL` is a regular var (defaults to `https://auth.clearday.geemeows.com`).
