-- AI provider settings: track when the configured API key was last
-- validated by the user (Settings → AI provider → "Test connection").
-- The settings page surfaces "Last validated 4m ago" so the user knows
-- their key still works.

alter table public.ai_settings
  add column if not exists last_validated_at timestamptz;
