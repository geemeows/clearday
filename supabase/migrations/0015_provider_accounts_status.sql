-- Surface poll health per provider so the Sources rail can render yellow on
-- rate-limit / red on auth failure (the deferred AC item from issue #4).
-- The cron orchestrator stamps this column after each poll: 'ok' on success,
-- 'rate_limited' on HTTP 429, 'auth_failed' on HTTP 401/403. /api/sources
-- reads it directly so the SPA's dot-color is whatever the last poll saw.

alter table public.provider_accounts
  add column if not exists status text not null default 'ok';

alter table public.provider_accounts
  drop constraint if exists provider_accounts_status_check;

alter table public.provider_accounts
  add constraint provider_accounts_status_check
  check (status in ('ok', 'rate_limited', 'auth_failed'));
