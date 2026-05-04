-- Onboarding completion timestamp on the singleton user_preferences row.
-- Null means the wizard hasn't been completed yet; any non-null value is the
-- ISO timestamp of when the user finished or skipped through to the end.
alter table public.user_preferences
  add column if not exists onboarded_at timestamptz null;
