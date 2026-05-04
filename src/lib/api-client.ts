// Thin browser-side wrapper around the user Worker's /api/* surface.
// Forwards the Supabase access token as a bearer so requireAllowedUser on
// the Worker can authenticate the call.

import { supabase } from "#/lib/supabase";

export type ApiFetch = typeof fetch;

async function bearerHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not signed in");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export async function apiFetch(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: ApiFetch = fetch,
): Promise<unknown> {
  const headers = await bearerHeaders();
  const res = await fetchImpl(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
