-- Quiet hours + per-event matrix + auto focus-block detection.
--
-- Adds the per-event channel matrix and quiet-hours config to
-- user_preferences (alongside the existing alert_channels list), and a
-- signal_alert_queue table that holds alerts deferred during quiet hours
-- until the window ends.

alter table public.user_preferences
  add column if not exists notification_matrix jsonb not null default '{}'::jsonb,
  add column if not exists quiet_hours_v2 jsonb not null default '{}'::jsonb,
  add column if not exists focus_block jsonb not null default '{}'::jsonb;

create table if not exists public.signal_alert_queue (
  signal_id uuid not null references public.signals(id) on delete cascade,
  threshold text not null,
  channels text[] not null default '{}',
  deliver_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (signal_id, threshold)
);

create index if not exists signal_alert_queue_due_idx
  on public.signal_alert_queue (deliver_at);

alter table public.signal_alert_queue enable row level security;

create policy signal_alert_queue_allowed_user on public.signal_alert_queue
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
