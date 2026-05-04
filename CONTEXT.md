# Clearday — Domain Context

A command center for software engineers: pulls actionable items from the daily
tools an engineer uses (GitHub, Linear, Jira, Google Calendar, Slack) into one
focus surface, so the engineer stops context-switching to check each app.

## Glossary

### Deployment model — Hybrid (shared OAuth apps, per-user backend)

Clearday is open source. Each user deploys their own backend — a Supabase
project and a Cloudflare Worker — which holds **their** integration tokens and
data. Clearday-the-project centrally registers and operates the **OAuth
applications** with each provider (GitHub, Slack, Jira, Google) so individual
users do not have to create their own OAuth apps on each provider.

Implication: there is a small piece of shared infrastructure (the OAuth app
registrations, and possibly a redirect/auth-proxy endpoint) that the project
maintains, but no shared database and no shared user data. Each user's tokens
never leave their own Supabase/Worker.

### Auth proxy

A single project-operated Cloudflare Worker (e.g. `auth.clearday.dev`) that is
the registered OAuth redirect URI for every provider. It is stateless: it
receives the OAuth `code` plus a signed `state` that encodes the user's own
backend URL, then redirects the code on to that backend, which performs the
token exchange. The auth proxy never persists tokens.
