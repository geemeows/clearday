-- Seed the sixth fixture automation (issue #99). Adds a Schedule-trigger
-- design fixture so the picker shows a non-event-driven automation alongside
-- the event-driven ones. Stays disabled (and dry-run by spec) — the cron
-- worker never picks it up; this is a pure design fixture, not an end-to-end
-- exercise of the Schedule path.
--
-- The dry-run flag in the spec is metadata only at this slice — the per-
-- automation `dry_run` column lands with the runs view (#95). Until then the
-- fixture lives as `enabled = false`, which is sufficient for "cron path does
-- not evaluate it".
--
-- The post_message body references a `{{schedule.merged_prs_summary}}` token
-- that has no resolver yet — placeholder for the templating helper landing
-- in #90.
--
-- Idempotent on `name` so re-applying the migration in a dev environment
-- doesn't double-seed.

insert into public.automations
  (name, enabled, priority, trigger_kind, trigger_config, predicates, actions)
select
  'Daily 9am merged-PR roundup',
  false,
  100,
  'schedule',
  jsonb_build_object('cron', '0 9 * * 1-5'),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'type', 'post_message',
      'target', 'self_dm',
      'body', '{{schedule.merged_prs_summary}}'
    )
  )
where not exists (
  select 1 from public.automations
  where name = 'Daily 9am merged-PR roundup'
);
