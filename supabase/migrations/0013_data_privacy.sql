-- Retention override on the singleton user_preferences row.
-- Default 90 days matches the v1 PRD retention policy; users can override
-- per-deployment from Settings → Data & privacy.

alter table public.user_preferences
  add column if not exists retention_days integer not null default 90;
