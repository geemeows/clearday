-- Email digest settings live alongside the rest of `user_preferences` as a
-- single JSONB blob. Stored shape (all fields optional):
--
--   {
--     "enabled":         boolean,           -- master cadence toggle
--     "transport":       "resend",          -- v1 supports Resend only
--     "api_key":         string,            -- enc:v1:... (llm-crypto + AI_KEY_SECRET)
--     "from_email":      string,            -- "Clearday <noreply@yourdomain>"
--     "to_email":        string,            -- recipient
--     "hour_utc":        number,            -- 0-23, daily send hour
--     "last_sent_date":  "YYYY-MM-DD"       -- idempotency for the daily tick
--   }
--
-- The api_key is encrypted with the same AI_KEY_SECRET that already gates
-- `ai_settings.api_key`; the GET endpoint never returns it (only has_api_key).

alter table public.user_preferences
  add column if not exists email_digest jsonb not null default '{}'::jsonb;
