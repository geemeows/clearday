-- Aggregate run statistics per automation, used by GET /api/automations (#175).
-- security invoker: the caller must be authenticated and RLS on automation_runs
-- already restricts rows to the allowed user.
create or replace function public.automation_run_stats()
returns table (
  automation_id uuid,
  total_runs    bigint,
  last_run_at   timestamptz,
  fail_7d       bigint
)
language sql
stable
set search_path = public
as $$
  select
    ar.automation_id,
    count(*)                                                               as total_runs,
    max(ar.started_at)                                                     as last_run_at,
    count(*) filter (
      where ar.status = 'failed'
        and ar.started_at > now() - interval '7 days'
    )                                                                      as fail_7d
  from public.automation_runs ar
  group by ar.automation_id
$$;
