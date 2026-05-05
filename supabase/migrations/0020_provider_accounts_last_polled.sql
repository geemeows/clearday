-- Surface poll freshness on the Sources rail. Slack moved off webhooks onto
-- the cron-polled adapter (#6), so the rail's "last verified" timestamp now
-- reflects the most recent successful poll instead of an inbound webhook.
-- Per-provider columns stay; cron stamps `last_polled_at` after every
-- successful pollOne. Nullable so existing rows keep working until the next
-- tick fills it in.

alter table public.provider_accounts
  add column if not exists last_polled_at timestamptz null;
