-- ai_settings.fallback_threshold_pct: percent of the monthly_budget_usd at
-- which Devy switches from the primary model to fallback_model. Until now
-- this was hardcoded to 80% in the meter; the Settings → AI provider
-- panel now exposes 50 / 70 / 80 / 90 / never per the v3 redesign.
--
-- See issue #143 (Redesign v3 / Slice 10 — AI provider grid + fallback +
-- budget).
--
-- Nullable on purpose: null means "never switch to fallback" (the user
-- picked the "Never" option). 50/70/80/90 are the only non-null values
-- the panel exposes; the check leaves room without enumerating every
-- possible integer.

alter table public.ai_settings
  add column if not exists fallback_threshold_pct integer;

alter table public.ai_settings
  drop constraint if exists ai_settings_fallback_threshold_pct_check;

alter table public.ai_settings
  add constraint ai_settings_fallback_threshold_pct_check
  check (
    fallback_threshold_pct is null
    or fallback_threshold_pct in (50, 70, 80, 90)
  );

-- Existing rows default to 80 (the prior hardcoded behaviour) so users
-- who never touch the picker see no change.
update public.ai_settings
  set fallback_threshold_pct = 80
  where fallback_threshold_pct is null;
