/// <reference types="@cloudflare/workers-types" />
import { createClient } from "@supabase/supabase-js";
import { handleOAuthExchange } from "#/lib/oauth-exchange-handler";
import { runScheduledPoll } from "#/worker/cron-orchestrator";
import {
  defaultGetUser,
  json,
  requireAllowedUser,
  type WorkerEnv,
} from "#/worker/middleware";
import { persistProviderAccount } from "#/worker/provider-accounts";
import {
  handleDismissSignal,
  handleListSignals,
  handleSources,
} from "#/worker/signals-api";

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/oauth/exchange") {
      // Unauthenticated by design: the browser arrives here mid-redirect from
      // the auth-proxy with no Clearday session. The signed `state` HMAC is
      // what proves the request is part of an OAuth flow this deployment
      // initiated.
      return handleOAuthExchange(request, env, {
        fetch: (input, init) => fetch(input, init),
        persist: persistProviderAccount(env),
      });
    }

    if (!url.pathname.startsWith("/api/")) {
      // Anything outside /api/* is served by the static SPA assets binding.
      return env_assets_fetch(env, request);
    }

    const gate = await requireAllowedUser(request, env, defaultGetUser(env));
    if ("response" in gate) return gate.response;

    if (url.pathname === "/api/me") {
      return json({ email: gate.user.email });
    }

    const service = serviceClient(env);

    if (url.pathname === "/api/signals" && request.method === "GET") {
      return handleListSignals(url, service);
    }

    const dismissMatch = url.pathname.match(
      /^\/api\/signals\/([^/]+)\/dismiss$/,
    );
    if (dismissMatch && request.method === "POST") {
      return handleDismissSignal(dismissMatch[1], service);
    }

    if (url.pathname === "/api/sources" && request.method === "GET") {
      return handleSources(async () => {
        const { data, error } = await service
          .from("provider_accounts")
          .select("provider, account_id, updated_at");
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{
          provider: string;
          account_id: string | null;
          updated_at: string | null;
        }>;
      });
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(
    _event: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const service = serviceClient(env);
    ctx.waitUntil(
      runScheduledPoll({
        loadAccounts: async () => {
          const { data, error } = await service
            .from("provider_accounts")
            .select("provider, access_token, refresh_token, expires_at");
          if (error) throw new Error(error.message);
          return (data ?? []) as Array<{
            provider: string;
            access_token: string | null;
            refresh_token: string | null;
            expires_at: string | null;
          }>;
        },
        saveRefreshedToken: async ({ provider, access_token, expires_at }) => {
          const { error } = await service
            .from("provider_accounts")
            .update({
              access_token,
              expires_at,
              updated_at: new Date().toISOString(),
            })
            .eq("provider", provider);
          if (error) throw new Error(error.message);
        },
        store: service,
        fetch: (input, init) => fetch(input, init),
        oauthEnv: {
          GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
          GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
          GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
          SLACK_CLIENT_ID: env.SLACK_CLIENT_ID,
          SLACK_CLIENT_SECRET: env.SLACK_CLIENT_SECRET,
          AUTH_PROXY_URL: env.AUTH_PROXY_URL,
        },
      })
        .then((reports) => {
          for (const r of reports) {
            if (r.error) {
              console.warn(`[cron] ${r.provider}: ${r.error}`);
            } else {
              console.log(`[cron] ${r.provider}: upserted ${r.upserted}`);
            }
          }
        })
        .catch((err) => {
          console.error("[cron] orchestrator failed", err);
        }),
    );
  },
} satisfies ExportedHandler<WorkerEnv>;

// biome-ignore lint/suspicious/noExplicitAny: thin Supabase service client
function serviceClient(env: WorkerEnv): any {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Wrangler injects `env.ASSETS` (Fetcher) when an [assets] binding is
// configured. We thread it through a helper so the worker file can be
// loaded under Vitest where `env.ASSETS` doesn't exist.
function env_assets_fetch(
  env: WorkerEnv,
  request: Request,
): Response | Promise<Response> {
  const assets = (env as unknown as { ASSETS?: Fetcher }).ASSETS;
  if (assets) return assets.fetch(request);
  return json({ error: "not found" }, 404);
}
