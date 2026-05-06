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

### Signal

The single, unified domain entity. Every actionable or time-bound thing
Clearday surfaces — a PR review request, a Slack mention, an upcoming meeting,
an assigned Jira/Linear ticket — is a `Signal`.

A Signal has a common shape (source provider, source id, title, url, created
timestamp, acted-on/dismissed state) and a `kind` discriminator with a JSON
payload carrying kind-specific fields (e.g. a meeting's `starts_at` and join
URL, a mention's channel and thread). The schema stays loose on purpose so
adding a new provider or kind doesn't require a migration.

### App login vs integration login

Two distinct concepts that both happen to use Google:

- **App login** — how the deployment's owner authenticates *into Clearday
  itself*. Done via Supabase Auth's Google provider. Produces only a Supabase
  session; provider access tokens are not retained for app use.
- **Integration login** — how Clearday gets ongoing access to a third-party's
  data (Calendar, Slack, GitHub, Jira, Linear). Done through the Auth proxy
  with provider-specific scopes and offline access; refresh tokens are stored
  in the user's own Supabase.

Even though Google appears in both, they are separate flows with different
scopes and different storage.

### Allowed user

A Clearday deployment is single-tenant: it belongs to exactly one engineer.
The owner sets an `ALLOWED_EMAIL` env var on their Worker; both a Postgres RLS
policy and a Worker-side check reject any session whose email does not match.
Prevents a leaked deployment URL from letting strangers create accounts inside
the owner's instance.

### Focus session

A user-initiated, time-boxed "do not disturb" period. Triggered from a single
button in Clearday: the user picks a duration and (optionally) a status
message; Clearday then writes the side effects to the providers and forgets:

- a Google Calendar event of that duration ("Focus" or the user's message);
- a Slack custom status with a matching `status_expiration`, plus
  `dnd.setSnooze` for the same duration.

Clearday does not store the focus session. All providers expire it
automatically at the end time. Stopping early, if needed, is done from Slack
or Calendar directly — not modeled here.

### AI provider (BYO)

Clearday does not run any shared AI inference. Each user supplies their own
API key for a provider of their choice (Gemini, Groq, OpenAI, Anthropic,
OpenRouter, etc.) — many of these have generous free tiers, which preserves
the project's $0-to-the-user posture. The key is stored in the user's own
Supabase. The Worker calls AI through a thin provider-agnostic chat-completion
interface so the user's choice of provider is a config value, not a code
change.

### Alert channel

The mechanism by which Clearday actually surfaces a time-sensitive Signal
(e.g. "meeting in 10 min", "review requested") to the user when the app is
not in the foreground. Each user picks their preferred channel(s) during
onboarding:

- **Slack self-DM** — the Worker posts to the user's own Slackbot DM,
  reusing the Slack integration the user already authorized.
- **Web Push (PWA)** — Clearday is installable as a PWA; a service worker
  receives push events and shows OS-level notifications. Requires VAPID
  setup and a per-device subscription stored in Supabase.

Both can be enabled at once. The channel choice is a user preference, not a
Signal property; any Signal that is `requires_action` and crosses a "time
to alert" threshold goes out on every enabled channel.

### v1 scope

The minimum surface that makes Clearday useful for daily dogfooding:

- Integrations: **GitHub, Google Calendar, Slack** only. Jira and Linear are
  deferred; the "assigned tasks" tab and most "this week" analytics ride
  along with whichever issue tracker lands.
- Inbox: **read-only**. Each Signal links out to its source app; Clearday
  itself does not approve PRs, post replies, or transition tickets.
- Writes: only those that implement the **Focus session** (Calendar event +
  Slack status/snooze).
- AI: a single **morning briefing** call.
- Alerts: user-selected channel (Slack self-DM and/or PWA Web Push).

### Signal rollup

The retention strategy for Signals. Raw rows are kept for the last 90 days
in the hot `signals` table; older raw rows are folded into a
`signal_rollups` table that holds one row per (period, kind) with
pre-aggregated counts and any cheap stats worth carrying forward (e.g. PRs
reviewed, mentions received, focus minutes). Periods are monthly, quarterly,
and yearly — written by a Worker cron on period boundaries, after which the
underlying raw rows are deleted. Rollups exist forever, raw rows do not.
This keeps the database tiny while still powering long-horizon "feel good"
summaries.

### Signal identity

Each Signal is uniquely identified by `(provider, kind, source_id)`. Updates
to the underlying thing — new comments on a PR, new replies in a Slack
thread — bump `updated_at` and an `unread_count` on the same row, never
create duplicates. The inbox shows one row per real-world thing.

### Provider

A third-party source Clearday integrates with — currently `github`, `google`,
`slack`, `linear`, `jira`. Each provider is one module that owns the full
runtime surface for that source: authorize config, token exchange, token
refresh (where applicable), the poll → Signal mapping, any per-provider state
the poll depends on (e.g. Slack's `participated_threads` and broadcast
allowlist), and the user-initiated **capabilities** Clearday exposes (e.g.
Slack's `postReply`, GitHub's `submitPrReview`, Calendar's `decline` /
`reschedule`).

The cron orchestrator and the worker route handlers are provider-agnostic:
they iterate the provider registry and call the same uniform interface. New
providers are added by writing one folder, not by editing N switch
statements.

### Capability

A user-initiated write action on a Signal that depends on a specific provider
— "reply to this Slack thread", "submit this PR review", "decline this
meeting". Capabilities are typed per-provider (a GitHub capability cannot be
called on a Slack signal at compile time) and live on the Provider object's
`capabilities` slot. Distinct from the `poll` verb, which is the read-side
ingest path every provider must implement.

### Provider sync strategy

Each provider gets the freshness mechanism that's actually practical for it,
not a one-size-fits-all rule:

- **GitHub** — cron-polled via the **search API**, ~every 1–2 minutes.
  Three queries cover v1: `is:open is:pr review-requested:@me`,
  `author:@me`, `assignee:@me`. No per-repo enumeration, no webhook
  install (cross-repo webhooks need org-level rights most engineers
  don't have).
- **Slack** — cron-polled every 1–2 minutes via Web API
  (`search.messages` / `conversations.history` / `conversations.replies`).
  Three queries cover v1: DMs and mentions for the authed user, plus replies
  in threads the user has already participated in (tracked via
  `slack_participated_threads`). Webhook/Events API was considered but
  dropped — polling avoids the publicly-reachable webhook URL requirement,
  which is awkward for the per-user-Worker hybrid deployment model.
- **Google Calendar** — cron-polled every 2 minutes. Push channels exist
  but expire weekly and aren't worth the renewal complexity for v1.

### Slack mention scope

The set of Slack events that become Signals:

- direct messages to the user;
- explicit `@<user>` mentions in any channel they're a member of;
- new replies in threads the user has already participated in;
- `@here` / `@channel` mentions, but only in channels the user has
  explicitly added to a Clearday-side allowlist.

Anything else (general channel chatter, broadcasts in non-allowlisted
channels) is ignored.

### GitHub scope

v1 tracks only PRs where the user is one of: requested reviewer, author,
or assignee. Discovered via the GitHub search API; no per-repo webhook
installation. Other GitHub surfaces (issues, discussions, notifications
inbox) are out of scope for v1.

### Calendar scope

Only the user's **primary** Google Calendar. An event becomes a Signal —
and triggers the 10-minute alert — only when:

- the user's response is `accepted` or `tentative` (declined events are
  ignored);
- the event has a video conference link (Google Meet, Zoom, Teams, etc.);
- it is not an all-day event.

Focus-session events written by Clearday itself match these filters too,
which is fine: they appear in the schedule widget but are filtered out of
the alert path by source tag (so you don't get a "Focus starts in 10 min"
ping for a block you just created).

### Auth proxy

A single project-operated Cloudflare Worker (e.g. `auth.clearday.dev`) that is
the registered OAuth redirect URI for every provider. It is stateless: it
receives the OAuth `code` plus a signed `state` that encodes the user's own
backend URL, then redirects the code on to that backend, which performs the
token exchange. The auth proxy never persists tokens.
