-- Inbox rules v2: typed rule store backing the Settings → Inbox rules panel
-- (issue #173). The original `inbox_rules` table was dropped in 0021 when the
-- surface was folded into Automations. This iteration restores a dedicated
-- table for the RuleBuilder UI, which uses a structured condition/action model
-- rather than the free-form jsonb blob from the old table.

create table public.inbox_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  match_all    boolean not null default true,
  conditions   jsonb not null default '[]'::jsonb,
  action       text not null,
  action_param text,
  enabled      boolean not null default true,
  hits_30d     integer not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.inbox_rules enable row level security;
create policy inbox_rules_allowed_user on public.inbox_rules
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
