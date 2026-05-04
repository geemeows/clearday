# Unified Signal entity

Every actionable or time-bound thing Clearday surfaces — a PR review request,
a Slack mention, an upcoming meeting, an assigned ticket — is stored as a
single `Signal` row with a common shape (source, source_id, title, url,
created_at, requires_action, dismissed_at) plus a `kind` discriminator and a
JSONB `payload` carrying kind-specific fields. The schema is deliberately
loose; type discipline lives in application code, not in Postgres.

## Considered options

- **Per-kind tables** (`github_pr_reviews`, `slack_mentions`,
  `calendar_events`, …). Strongly typed, clean queries, but the unified
  inbox view becomes a UNION across N tables, ranking and dismissal logic
  duplicate, and adding a provider requires a migration.
- **Two-category split** — `Inbox` (mentions, reviews, tasks) vs `Schedule`
  (meetings, focus blocks). Honest about the lifecycle difference between
  "thing that happened, react to it" and "future event with a clock", but
  the user explicitly wants flexibility and minimal complexity for a side
  project, and a Schedule/Inbox split forces awkward home-finding for
  hybrid items (e.g. tasks with due dates).
- **Defer abstraction** — keep raw provider tables, unify later. Rejected:
  unification rarely happens cleanly after callers proliferate, and the
  whole point of Clearday is the unified inbox.

## Consequences

- Queries that need a kind-specific field (e.g. "meetings starting in the
  next 10 minutes") read it out of `payload` JSON. Postgres handles this
  fine but indexes must be added per access pattern.
- The TypeScript layer carries the discriminated union; runtime validation
  (zod) at the cache-write boundary is what keeps payloads honest. A
  future contributor "fixing" the JSON blob into typed columns would
  break this design — that's why this ADR exists.
- Adding a new provider or `kind` is code-only, no migration.
