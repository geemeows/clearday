-- Theme & layout fields on the singleton user_preferences row.
-- See issue #23 (Settings polish — Theme & layout sub-page).
--
-- theme:   'light' | 'dark' | 'system' (default 'system')
-- density: 'comfortable' | 'compact'   (default 'comfortable')
-- accent:  'rausch' | 'ocean' | 'forest' | 'plum' (default 'rausch')

alter table public.user_preferences
  add column if not exists theme text,
  add column if not exists density text,
  add column if not exists accent text;
