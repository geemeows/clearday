-- Profile fields on the singleton user_preferences row.
-- See issue #23 (Settings polish — Profile sub-page).

alter table public.user_preferences
  add column if not exists display_name text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists avatar_url text;
