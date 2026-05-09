-- project_card_tickets: links a project card to one or more external tickets
-- (PRs/issues) on GitHub, Linear, or Jira. v1 only ships the GitHub resolver
-- end-to-end; the `source` column accepts the other values for future slices.
--
-- Cached metadata columns (status, assignee, last_seen_at) are populated by
-- the Worker via the provider's read-only API. Nothing in the app writes back
-- to the upstream provider — this table is one-way.

create table public.project_card_tickets (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.project_cards (id) on delete cascade,
  source text not null check (source in ('github', 'linear', 'jira')),
  ext_id text not null,
  url text not null,
  status text,
  assignee text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index project_card_tickets_card_source_ext_unique
  on public.project_card_tickets (card_id, source, ext_id);

create index project_card_tickets_card_id_idx
  on public.project_card_tickets (card_id);

alter table public.project_card_tickets enable row level security;
create policy project_card_tickets_allowed_user on public.project_card_tickets
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
