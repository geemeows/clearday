-- signal_alerts: idempotency ledger for the alert dispatcher.
--
-- The dispatcher is the single entry point that fans a "fire-worthy" Signal
-- out to enabled channels (Slack DM today, Web Push / email digest in later
-- slices). Before fan-out it inserts a row keyed on (signal_id, threshold)
-- so the same alert never fires twice across cron ticks, retries, or
-- redelivered webhooks. `threshold` is a free-form discriminator —
-- 'new' for fan-out on Signal write, '10min' for the meeting pre-alert.

create table public.signal_alerts (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  threshold text not null,
  channels text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (signal_id, threshold)
);

create index signal_alerts_signal_idx on public.signal_alerts (signal_id);

alter table public.signal_alerts enable row level security;
create policy signal_alerts_allowed_user on public.signal_alerts
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
