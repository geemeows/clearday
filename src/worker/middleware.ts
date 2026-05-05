import { createClient } from "@supabase/supabase-js";
import { isAllowedEmail } from "#/lib/auth-gate";

export type WorkerEnv = {
  ALLOWED_EMAIL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  STATE_HMAC_SECRET: string;
  AUTH_PROXY_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  SLACK_SIGNING_SECRET: string;
  LINEAR_CLIENT_ID?: string;
  LINEAR_CLIENT_SECRET?: string;
  JIRA_CLIENT_ID?: string;
  JIRA_CLIENT_SECRET?: string;
  AI_KEY_SECRET: string;
  /** VAPID public key (uncompressed P-256, 65 bytes, b64url). */
  VAPID_PUBLIC_KEY: string;
  /** VAPID private key (32-byte P-256 scalar, b64url). */
  VAPID_PRIVATE_KEY: string;
  /** mailto: contact for VAPID `sub`; required by RFC 8292. */
  VAPID_SUBJECT: string;
  /** Optional build-time version stamp surfaced on the Self-host page. */
  WORKER_VERSION?: string;
};

export type AuthedUser = {
  id: string;
  email: string;
};

export type GetUser = (token: string) => Promise<AuthedUser | null>;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function defaultGetUser(env: WorkerEnv): GetUser {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  };
}

export async function requireAllowedUser(
  request: Request,
  env: WorkerEnv,
  getUser: GetUser,
): Promise<{ user: AuthedUser } | { response: Response }> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) {
    return { response: json({ error: "missing bearer token" }, 401) };
  }
  const user = await getUser(match[1]);
  if (!user) {
    return { response: json({ error: "invalid session" }, 401) };
  }
  if (!isAllowedEmail(user.email, env.ALLOWED_EMAIL)) {
    return {
      response: json({ error: "not authorized for this deployment" }, 403),
    };
  }
  return { user };
}
