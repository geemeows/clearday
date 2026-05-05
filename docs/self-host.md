# Self-hosting Clearday

Clearday is designed to be self-hosted: you run your own Cloudflare Worker on
your own domain, and your data lives in your own Supabase project. The only
shared piece is the **auth-proxy** that brokers OAuth — and even that is
optional, with two supported paths:

- **Path A — shared auth-proxy** (recommended default): use the project-run
  `auth.clearday.geemeows.com`. No OAuth app registration needed. You get
  whichever providers the project owner has wired up.
- **Path B — self-hosted auth-proxy**: run your own auth-proxy Worker. You
  register your own OAuth apps with each provider. Full control, no
  dependence on the project's infra.

See ADR-0003 (`docs/adr/0003-oauth-proxy.md`) for the architecture; this guide
covers the operator steps end-to-end.

## 0. Prerequisites

- Node 20+ and `pnpm`.
- A **Cloudflare** account (free tier is fine). Run `pnpm wrangler login` once.
- A **Supabase** project. Free tier is fine. You'll need its URL, anon key,
  and service-role key.
- A custom domain on Cloudflare for your user Worker (e.g.
  `clearday.you.com`). Optional for local dev, required for Slack OAuth and
  Web Push in production.
- Path B only: a developer account on each provider you want to wire up
  (GitHub, Google Cloud, Slack, Linear, Atlassian).

## 1. Clone + install

```bash
git clone https://github.com/geemeows/clearday.git
cd clearday
pnpm install
```

## 2. Set up Supabase

1. Create a new Supabase project.
2. Apply the migrations from `supabase/migrations/` in order. Easiest:
   `pnpm dlx supabase link --project-ref <ref>` then
   `pnpm dlx supabase db push`. Or run them manually via the SQL editor.
3. Note the project's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (Settings → API).
4. (Recommended) Enable the Google provider under **Authentication →
   Providers** and add the Google OAuth client you'll create below — this is
   the *login* identity for the single allowed user, separate from the
   per-provider integrations.

## 3. Choose your auth-proxy path

### Path A — Use the shared auth-proxy (default)

Skip Step 4 entirely. You'll set
`AUTH_PROXY_URL=https://auth.clearday.geemeows.com` and
`ENVELOPE_PUBLIC_KEY=<the project's published key>` on your user Worker (Step
5). You do not register any OAuth apps.

> ⚠️ Trust note: Path A means the project's auth-proxy briefly handles your
> in-flight OAuth codes. It does **not** persist your tokens — they go
> straight from the proxy into your Supabase. See the README's "Trust note"
> for the full disclosure.

### Path B — Run your own auth-proxy

You'll run a second Cloudflare Worker (the one in `workers/auth-proxy/`)
under a domain you control (e.g. `auth.clearday.you.com`).

**Generate an envelope keypair:**

```bash
pnpm tsx scripts/generate-envelope-keypair.ts
# Outputs ENVELOPE_PUBLIC_KEY and ENVELOPE_PRIVATE_KEY.
# Save these. The private key goes on your auth-proxy; the public key on
# your user Worker. Never commit either.
```

**Register OAuth apps with each provider you want enabled.** The redirect
URI for every provider is `https://<your-auth-proxy-domain>/callback/<provider>`.

| Provider | Where to register | Required scopes (user_scope where applicable) | Notes |
| --- | --- | --- | --- |
| GitHub | <https://github.com/settings/developers> → New OAuth App | `read:user`, `repo` | Use the OAuth-app flavor (not GitHub App) so org-grant works. |
| Google | <https://console.cloud.google.com/apis/credentials> → OAuth 2.0 Client ID (Web application) | `openid`, `https://www.googleapis.com/auth/calendar.events` | Enable the **Google Calendar API** in the same project. While in testing, add yourself as a Test User in the OAuth consent screen. |
| Slack | <https://api.slack.com/apps> → Create New App → From scratch | user_scope: `channels:read`, `groups:read`, `im:read`, `mpim:read`, `search:read`, `users.profile:write`, `dnd:write` | Set Redirect URL under **OAuth & Permissions**. |
| Linear | <https://linear.app/settings/api/applications> → New OAuth Application | `read` | |
| Jira/Atlassian | <https://developer.atlassian.com/console/myapps/> → Create → OAuth 2.0 (3LO) | `read:jira-user`, `read:jira-work`, `offline_access` | Add the Jira platform. |

**Configure and deploy your auth-proxy Worker:**

```bash
cd workers/auth-proxy
# Edit wrangler.jsonc: set name, route, and AUTH_PROXY_URL var to your
# auth-proxy domain (e.g. https://auth.clearday.you.com).
pnpm wrangler secret put STATE_HMAC_SECRET            # random 32+ bytes (e.g. openssl rand -base64 48)
pnpm wrangler secret put ENVELOPE_PRIVATE_KEY         # from the keypair above
pnpm wrangler secret put ENVELOPE_PUBLIC_KEY          # from the keypair above
pnpm wrangler secret put GITHUB_CLIENT_ID
pnpm wrangler secret put GITHUB_CLIENT_SECRET
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put SLACK_CLIENT_ID
pnpm wrangler secret put SLACK_CLIENT_SECRET
pnpm wrangler secret put LINEAR_CLIENT_ID             # optional
pnpm wrangler secret put LINEAR_CLIENT_SECRET         # optional
pnpm wrangler secret put JIRA_CLIENT_ID               # optional
pnpm wrangler secret put JIRA_CLIENT_SECRET           # optional
pnpm wrangler deploy
```

## 4. Configure your user Worker

Edit the root `wrangler.jsonc`:

- `name` — your Worker name.
- `routes` / `workers_dev` — your domain (e.g. `clearday.you.com/*`).
- Keep `assets.run_worker_first: ["/oauth/*", "/api/*"]` and
  `not_found_handling: "single-page-application"` — both are required.
- Cron triggers stay as-is (default 5 min).

Set secrets:

```bash
pnpm wrangler secret put SUPABASE_URL
pnpm wrangler secret put SUPABASE_ANON_KEY
pnpm wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm wrangler secret put STATE_HMAC_SECRET            # any random value; per-Worker
pnpm wrangler secret put ALLOWED_EMAIL                # the single email allowed to log in
pnpm wrangler secret put AI_KEY_SECRET                # 32-byte secret for at-rest BYO-key encryption
pnpm wrangler secret put ENVELOPE_PUBLIC_KEY          # Path A: project's published key. Path B: your keypair's public half.
```

Set `AUTH_PROXY_URL` as a **var** (not a secret — it's not sensitive):

- Path A: `https://auth.clearday.geemeows.com`
- Path B: your auth-proxy domain.

Optional secrets (only if you need the feature):

- `SLACK_SIGNING_SECRET` — only while Slack uses webhooks; will be removed
  when Slack ingest moves fully to polling.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push.

## 5. Build and deploy

```bash
pnpm run deploy   # builds the SPA into dist/ and runs wrangler deploy
```

`pnpm wrangler deploy` alone does **not** rebuild the SPA — always use
`pnpm run deploy` after frontend changes.

## 6. First login

1. Visit your Worker's domain.
2. Sign in with the Google account whose email matches `ALLOWED_EMAIL`.
   Anything else is rejected by the single-user gate.
3. Go to `/settings` → Integrations and click "Connect" for each provider.
   The redirect chain is: your site → auth-proxy `/start/<provider>` →
   provider authorize → auth-proxy `/callback/<provider>` → your site
   `/oauth/exchange?envelope=…`.

## 7. Verify the cron is working

```bash
pnpm wrangler tail
```

Wait one cron tick (default 5 min). You should see GitHub PRs and Google
Calendar meetings appear in `/inbox` and `/today`.

## Troubleshooting

- **"auth-proxy: not implemented yet"** — your auth-proxy is still on a stub
  deploy. Redeploy (Path B) or your `AUTH_PROXY_URL` is wrong (Path A —
  should be `https://auth.clearday.geemeows.com`).
- **Cloudflare 1101 / `stripTrailingSlash` TypeError** — `AUTH_PROXY_URL` is
  unset on the auth-proxy Worker.
- **"Not Found" at `/oauth/exchange`** — your user Worker is missing
  `assets.run_worker_first: ["/oauth/*", "/api/*"]`. Cloudflare's SPA
  fallback is intercepting before the Worker can answer.
- **Google "Access blocked" / "geemeows.com has not completed verification"**
  — Path A only: ask the project owner to add you as a Test User. Path B:
  add yourself as a Test User on your own consent screen, or publish the
  app.
- **Google `auth_failed` after consent** — Calendar API not enabled on the
  GCP project.
- **"Too many subrequests"** — the cron is hitting Cloudflare's free-tier
  50-subrequest limit. Make sure you're on the latest code (signal upserts
  are batched).

## What self-hosters do *not* need to do

- Register OAuth apps (Path A only).
- Run a separate auth-proxy (Path A only).
- Hold any provider `client_secret`s on the user Worker — those only ever
  live on the auth-proxy.
- Set up custom domains for Supabase, AI providers, etc. — those use the
  providers' own URLs.
