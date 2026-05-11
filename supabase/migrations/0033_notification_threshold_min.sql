-- notification_threshold_min preference on the singleton user_preferences row.
-- See issue #145 (Redesign v3 / Slice 12 — Onboarding Alerts step persistence).
--
-- How many minutes before a meeting Devy nudges you. One of 2, 5, 10, 15, 30.
-- Default 10 matches the existing hardcoded pre-meeting tick.

alter table public.user_preferences
  add column if not exists notification_threshold_min integer not null default 10;

alter table public.user_preferences
  drop constraint if exists user_preferences_notification_threshold_min_check;

alter table public.user_preferences
  add constraint user_preferences_notification_threshold_min_check
  check (notification_threshold_min in (2, 5, 10, 15, 30));
