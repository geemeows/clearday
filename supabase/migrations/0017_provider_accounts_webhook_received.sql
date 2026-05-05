-- Surface webhook health on the Sources rail. Cron-polled providers already
-- report freshness via `provider_accounts.updated_at` from each poll, but
-- webhook providers (Slack today; whatever else later) need an explicit
-- "last verified webhook received" stamp so a quiet integration shows the
-- right thing instead of looking healthy because the OAuth row is intact.
--
-- The Slack webhook handler stamps this column after every verified
-- event_callback (deferred AC item from issue #6: "Sources rail webhook
-- health timestamp").

alter table public.provider_accounts
  add column if not exists last_webhook_received_at timestamptz null;
