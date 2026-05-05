# Hybrid deployment with a project-run auth proxy

> **Note:** the OAuth handoff sketched here ("proxy 302-redirects the code
> to the backend, which performs the token exchange") is superseded by
> ADR-0003. The proxy now performs the exchange itself and forwards a
> short-lived Ed25519-signed envelope. The deployment-shape rationale below
> (self-hosted user-Workers + one shared stateless Worker) still stands.

Clearday is open source and self-hosted (each user runs their own Supabase
project + Cloudflare Worker holding their own integration tokens), but the
project also operates one piece of shared infrastructure: a stateless
Cloudflare Worker that is the registered OAuth redirect URI for every
provider. It receives `code` + a signed `state` encoding the user's own
backend URL, then 302-redirects the code to that backend, which performs the
token exchange. The proxy never persists tokens.

## Considered options

- **Pure self-hosted, per-user OAuth apps.** Every user registers their own
  GitHub/Slack/Jira/Google OAuth applications and pastes
  `client_id`/`client_secret` into their `.env`. Truly zero shared infra.
  Rejected: registering 4–5 OAuth apps is a multi-hour onboarding chore,
  effectively kills adoption for a tool whose pitch is "reduce friction".
- **Hosted SaaS.** One Supabase, one set of OAuth apps, users just sign in.
  Rejected: violates the $0-cost goal, makes the project a data processor
  for everyone's Slack/Jira tokens.
- **Device-flow only.** GitHub and Google support OAuth device flow, no
  redirect URI needed. Rejected as the sole answer because Slack and Jira
  Cloud do not — we'd still need a proxy for them, so the simplification
  doesn't materialize.

## Consequences

- The project takes on a small operational responsibility (one stateless
  Worker on Cloudflare's free tier). It must stay online; if it goes down,
  every user's OAuth re-auths break.
- The proxy briefly sees authorization codes in transit. Codes are
  single-use and short-lived, but this is a non-zero trust ask the docs
  must be honest about.
- Changing the proxy URL later requires updating every provider's
  registered redirect URI and asking every existing user to re-authorize.
