// Vitest setup. The env layer (#/env) reads import.meta.env at module
// evaluation, so seed test values before any test imports it.
import.meta.env.VITE_SUPABASE_URL = "https://test.supabase.co";
import.meta.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
import.meta.env.VITE_ALLOWED_EMAIL = "owner@example.com";
