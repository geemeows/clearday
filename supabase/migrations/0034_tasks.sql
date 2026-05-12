-- Tasks feature: minimal native table backing the redesigned Tasks page
-- (Redesign v4 / Slice 4, issue #172).
--
-- This is a tracer-bullet slice: only the read shape consumed by
-- `src/routes/_app.tasks.tsx` (id, title, p, status, days, pr, labels) lands
-- here. Mutations (assign / status transitions / link PR) and any
-- Linear/Jira adapter are out of scope for this slice. Same allowed-user RLS
-- pattern as projects / signals.

create table public.tasks (
  -- Human-facing ticket id (e.g. "DEV-441"). Doubles as primary key so the
  -- mockup's mono ticket-id chip stays the canonical handle end-to-end.
  id text primary key,
  title text not null,
  priority text not null,
  status text not null,
  days integer not null default 0,
  pr text,
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint tasks_priority_check check (priority in ('P1', 'P2', 'P3')),
  constraint tasks_status_check check (status in ('todo', 'in_progress', 'review', 'done'))
);

create index tasks_status_idx on public.tasks (status);

alter table public.tasks enable row level security;
create policy tasks_allowed_user on public.tasks
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
