-- Projects feature: schema, RLS, cascade delete.
-- Three tables: projects → project_columns → project_cards.
-- All tables use the same allowed-user RLS pattern as signals.
-- Hard-delete cascade: deleting a project removes all its columns and cards.

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index projects_archived_idx on public.projects (archived)
  where archived = false;

alter table public.projects enable row level security;
create policy projects_allowed_user on public.projects
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- project_columns
-- ----------------------------------------------------------------------------
create table public.project_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  "order" integer not null default 0,
  wip_limit integer,
  created_at timestamptz not null default now()
);

create index project_columns_project_id_idx on public.project_columns (project_id);

alter table public.project_columns enable row level security;
create policy project_columns_allowed_user on public.project_columns
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- project_cards
-- ----------------------------------------------------------------------------
create table public.project_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  column_id uuid not null references public.project_columns (id) on delete cascade,
  "order" integer not null default 0,
  title text not null,
  body text,
  priority text,
  tags text[] not null default '{}',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create index project_cards_column_id_idx on public.project_cards (column_id);
create index project_cards_project_id_idx on public.project_cards (project_id);
create index project_cards_due_at_idx on public.project_cards (due_at)
  where due_at is not null;

alter table public.project_cards enable row level security;
create policy project_cards_allowed_user on public.project_cards
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
