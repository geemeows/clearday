-- Expose public.allowed_email() to anon so the client can fetch the
-- canonical allowed email at boot (single source of truth, no env var
-- duplication). The function is SECURITY DEFINER so it can read
-- app_settings even though that table is RLS-gated; it returns only
-- the single email string, nothing else.

grant execute on function public.allowed_email() to anon, authenticated;
