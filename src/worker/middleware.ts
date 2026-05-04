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
