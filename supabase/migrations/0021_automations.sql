-- Inbox rules → Automations (issue #89, ADR-0004).
--
-- The "Inbox rules" surface is folded into a unified Automations feature with
-- a typed trigger discriminator. v1 ships only the `signal_ingested` trigger
-- and the internal-action vocabulary (dismiss, snooze, tag, set_priority,
-- set_channels) — the same effects the old inbox-rules engine supported, now
-- stored in the new shape and reachable from any future trigger.
--
-- Each fired automation lands one row in `automation_runs` keyed on
-- `(automation_id, trigger_event_id)`. Re-polls of the same Signal produce the
-- same trigger_event_id, so the unique index gives us idempotency without any
-- application-level dedupe.
--
-- The old `inbox_rules` rows are converted 1:1 into `automations` with
-- `trigger_kind = 'signal_ingested'` and the predicate/effect JSON moved
-- across (effects → actions, with the same shape so the engine reads the same
-- vocabulary). The `inbox_rules` table is dropped at the end of this
-- migration; no read-side traffic should remain after the same PR retires the
-- /api/inbox-rules handler and the Settings → Inbox rules panel.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  trigger_kind text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  predicates jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger_event_id text not null,
  signal_id uuid null,
  status text not null,
  actions_planned jsonb not null default '[]'::jsonb,
  actions_executed jsonb not null default '[]'::jsonb,
  error text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  constraint automation_runs_status_check
    check (status in ('pending', 'succeeded', 'failed', 'skipped_dry_run', 'skipped_idempotent'))
);

create unique index if not exists automation_runs_event_unique_idx
  on public.automation_runs (automation_id, trigger_event_id);

create index if not exists automation_runs_automation_id_idx
  on public.automation_runs (automation_id, started_at desc);

-- Carry over the legacy inbox_rules rows. The predicate JSON moves verbatim;
-- the action vocabulary renamed three slots (`auto_dismiss` → `dismiss`,
-- `priority` → `set_priority`, `channels` → `set_channels`) so the migration
-- rewrites those `type` discriminators on the way through. The remaining
-- types (`snooze`, `tag`) and the slot-specific fields are unchanged.
do $$
declare
  rename_action jsonb := jsonb_build_object(
    'auto_dismiss', 'dismiss',
    'priority', 'set_priority',
    'channels', 'set_channels'
  );
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inbox_rules'
  ) then
    insert into public.automations
      (id, name, enabled, priority, trigger_kind, trigger_config, predicates, actions, created_at, updated_at)
    select
      r.id,
      r.name,
      r.enabled,
      r.priority,
      'signal_ingested' as trigger_kind,
      '{}'::jsonb as trigger_config,
      coalesce(r.match->'predicates', '[]'::jsonb) as predicates,
      coalesce(
        (
          select jsonb_agg(
            case
              when rename_action ? (e->>'type')
                then jsonb_set(e, '{type}', to_jsonb(rename_action->>(e->>'type')))
              else e
            end
            order by ord
          )
          from jsonb_array_elements(coalesce(r.action->'effects', '[]'::jsonb))
            with ordinality as t(e, ord)
        ),
        '[]'::jsonb
      ) as actions,
      r.created_at,
      r.updated_at
    from public.inbox_rules r;
  end if;
end $$;

drop table if exists public.inbox_rules;

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

create policy automations_allowed_user
  on public.automations
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

create policy automation_runs_allowed_user
  on public.automation_runs
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
