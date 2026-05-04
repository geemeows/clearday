-- AI budget meter + privacy redactor settings.
--
-- Extend public.ai_settings with the user-tunable knobs the v1 PRD calls
-- for: a monthly USD budget, a fallback model used at ≥80% of that
-- budget, a privacy-mode master toggle, custom redaction patterns, and
-- a hard "disable AI on this account" toggle.

alter table public.ai_settings
  add column if not exists monthly_budget_usd numeric(10, 2) not null default 25.00,
  add column if not exists fallback_model text,
  add column if not exists privacy_mode boolean not null default false,
  add column if not exists redact_patterns text[] not null default '{}'::text[],
  add column if not exists ai_disabled boolean not null default false;
