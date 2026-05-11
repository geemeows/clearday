-- calendar_week_start preference on the singleton user_preferences row.
-- See issue #146 (Redesign v3 / Slice 4 — week-start preference module).
--
-- 'sun' | 'mon' | 'sat'  (default 'mon')

alter table public.user_preferences
  add column if not exists calendar_week_start text default 'mon';

alter table public.user_preferences
  drop constraint if exists user_preferences_calendar_week_start_check;

alter table public.user_preferences
  add constraint user_preferences_calendar_week_start_check
  check (calendar_week_start in ('sun', 'mon', 'sat'));
