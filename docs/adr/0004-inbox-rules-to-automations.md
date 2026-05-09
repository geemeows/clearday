# Inbox Rules → Automations

The "Inbox rules" feature (a `signal_ingested` event filtered by predicates,
mapped to a small vocabulary of internal effects on the resulting Signal) is
absorbed into a unified **Automations** surface. An Automation has a `trigger`
(initially `signal_ingested`; future kinds: `signal_state_change`,
`focus_started`, `focus_ended`, `schedule`), a list of `predicates`, and a list
of `actions`. Internal actions (`dismiss`, `snooze`, `tag`, `set_priority`,
`set_channels`) keep the same vocabulary they had as inbox-rule effects and
remain reachable as first-class actions; the surface is also designed to take
provider actions (Slack `post_message`, GitHub `comment_on_pr`, Focus
`set_focus`, …) in a future slice.

The `inbox_rules` table is dropped at this slice. Existing rows are migrated
1:1 into `automations` with `trigger_kind = 'signal_ingested'`.

## Considered options

- **Keep Inbox Rules as a separate page**, build Automations alongside. Two
  surfaces with overlapping mental models ("when a Signal lands → apply X")
  and divergent storage. Rejected — duplicating the predicate vocabulary and
  the engine across two features is the kind of churn we want to avoid for a
  side project, and the user would have to reason about which surface the
  feature they want lives in.
- **Generalise Inbox Rules to also cover other triggers in-place**, without
  renaming. Rejected — the existing schema (`match`/`action` JSON columns,
  no trigger discriminator) hardcodes the assumption that every rule fires on
  Signal ingestion. Adding a `trigger_kind` column to `inbox_rules` and
  letting effects mean different things per trigger would muddy the
  glossary; the rename pins the new domain word.
- **Keep both tables in parallel during a soft-cutover window.** Rejected per
  the slicing the user picked when they invoked /do-work — a clean cut is
  fine because the two surfaces are read-only equivalent for v1
  (`signal_ingested` + internal actions covers the entire old vocabulary).

## Consequences

- Glossary update: CONTEXT.md replaces the **Inbox rule** entry with
  **Automation**. Every reference to "inbox rule" in code/docs becomes
  "automation".
- The old `features/inbox-rules/` module is removed; the engine becomes
  `features/automations/engine.ts` with a renamed pure planner. The
  `previewInboxRules` / `validateInboxRules` helpers move along.
- A new `automation_runs` table records every fired automation keyed on
  `(automation_id, trigger_event_id)` so re-polls are idempotent and the
  user can see a history of what fired.
- The SettingsPanel "Inbox rules" tab is retired and the UI moves to a
  top-level `/automations` route alongside Today, Inbox, Tasks, Calendar
  (per PRD #87).
- No rollback path. The migration is destructive (drops `inbox_rules`); the
  conversion is mechanical and the old table's rows are preserved as the new
  table's rows, but anyone holding a downgrade snapshot expecting
  `inbox_rules` to exist would break. This is a single-tenant side project
  per ADR-0001, so we accept it.
