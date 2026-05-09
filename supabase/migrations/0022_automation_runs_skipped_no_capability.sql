-- Extend automation_runs.status to allow `skipped_no_capability` (issue #96).
--
-- Wiring for `transition_ticket` and any future deferred-capability action.
-- The executor stamps this status when a planned action's capability has not
-- yet landed (e.g. Linear/Jira ticket transitions in v1). Surfaces in the
-- runs view so users see the deferred dispatch rather than silent failure.

alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add constraint automation_runs_status_check
  check (status in (
    'pending',
    'succeeded',
    'failed',
    'skipped_dry_run',
    'skipped_idempotent',
    'skipped_no_capability'
  ));
