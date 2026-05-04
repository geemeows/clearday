/// <reference types="@cloudflare/workers-types" />
import {
  defaultGetUser,
  json,
  requireAllowedUser,
  type WorkerEnv,
} from "#/worker/middleware";

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      // Anything outside /api/* is served by the static SPA assets binding.
      return env_assets_fetch(env, request);
    }

    const gate = await requireAllowedUser(request, env, defaultGetUser(env));
    if ("response" in gate) return gate.response;

    if (url.pathname === "/api/me") {
      return json({ email: gate.user.email });
    }

    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<WorkerEnv>;

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
