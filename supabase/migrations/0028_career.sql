-- Career feature — tracer slice (PRD #115).
-- Five tree tables (level → competencies → criteria → indicators → evidence)
-- plus a per-deployment scale legend. Sharing (career_shares) and the Google
-- Sheets sync columns ride along on career_levels (sheet_id, last_synced_at)
-- so the foundations don't need a follow-up alter when those slices land.
-- All tables follow the existing is_allowed_user() RLS pattern.

-- ----------------------------------------------------------------------------
-- career_levels
-- ----------------------------------------------------------------------------
create table public.career_levels (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  header jsonb not null default '[]'::jsonb,
  sheet_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- Exactly one active level at a time.
create unique index career_levels_one_active_idx on public.career_levels (status)
  where status = 'active';

alter table public.career_levels enable row level security;
create policy career_levels_allowed_user on public.career_levels
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- career_competencies
-- ----------------------------------------------------------------------------
create table public.career_competencies (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.career_levels (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index career_competencies_level_id_idx on public.career_competencies (level_id);

alter table public.career_competencies enable row level security;
create policy career_competencies_allowed_user on public.career_competencies
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- career_criteria
-- ----------------------------------------------------------------------------
create table public.career_criteria (
  id uuid primary key default gen_random_uuid(),
  competency_id uuid not null references public.career_competencies (id) on delete cascade,
  name text not null,
  target smallint not null default 0 check (target between 0 and 4),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index career_criteria_competency_id_idx on public.career_criteria (competency_id);

alter table public.career_criteria enable row level security;
create policy career_criteria_allowed_user on public.career_criteria
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- career_indicators
-- ----------------------------------------------------------------------------
create table public.career_indicators (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.career_criteria (id) on delete cascade,
  code text,
  description text not null default '',
  notes text,
  score smallint not null default 0 check (score between 0 and 4),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index career_indicators_criterion_id_idx on public.career_indicators (criterion_id);

alter table public.career_indicators enable row level security;
create policy career_indicators_allowed_user on public.career_indicators
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- career_evidence
-- ----------------------------------------------------------------------------
create table public.career_evidence (
  id uuid primary key default gen_random_uuid(),
  indicator_id uuid not null references public.career_indicators (id) on delete cascade,
  title text not null,
  url text,
  note text,
  card_id uuid references public.project_cards (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index career_evidence_indicator_id_idx on public.career_evidence (indicator_id);

alter table public.career_evidence enable row level security;
create policy career_evidence_allowed_user on public.career_evidence
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ----------------------------------------------------------------------------
-- career_scale_legend
-- ----------------------------------------------------------------------------
-- Single-row table holding the user-global 0–4 scale labels. A single-row
-- pattern (rather than per-level) matches the PRD: every level renders with
-- consistent score meanings.
create table public.career_scale_legend (
  id smallint primary key default 1 check (id = 1),
  label_0 text not null default '',
  label_1 text not null default '',
  label_2 text not null default '',
  label_3 text not null default '',
  label_4 text not null default ''
);

alter table public.career_scale_legend enable row level security;
create policy career_scale_legend_allowed_user on public.career_scale_legend
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

insert into public.career_scale_legend (id) values (1)
  on conflict (id) do nothing;
