/// <reference types="@cloudflare/workers-types" />
import { createClient } from "@supabase/supabase-js";
import {
  type AiSettingsRow,
  type AiSettingsStore,
  getAiSettings,
  type PutBody,
  putAiSettings,
  testAiConnection,
} from "#/lib/ai-settings-api";
import { sendSlackDm } from "#/lib/alert-channel/slack-dm";
import type { AlertChannel } from "#/lib/alert-dispatcher";
import { type BriefingDeps, handleBriefingGenerate } from "#/lib/briefing-api";
import { startFocusSession } from "#/lib/focus-session";
import { runMeetingAlertTick } from "#/lib/meeting-alert-tick";
import { handleOAuthExchange } from "#/lib/oauth-exchange-handler";
import type { StoredSignal } from "#/lib/signal";
import { handleSlackWebhook } from "#/lib/slack-webhook";
import {
  buildDispatcherDeps,
  dispatchUpsertedSignal,
  loadUpcomingMeetings,
} from "#/worker/alert-glue";
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

    if (url.pathname === "/webhooks/slack" && request.method === "POST") {
      // Public endpoint by design — Slack signs the request and we verify
      // before doing anything. No Clearday session is involved.
      const service = serviceClient(env);
      const dispatcher = buildDispatcherDeps(service, (i, init) =>
        fetch(i, init),
      );
      const outcome = await handleSlackWebhook(request, {
        signingSecret: env.SLACK_SIGNING_SECRET,
        store: service,
        loadAllowlist: async () => {
          const { data, error } = await service
            .from("slack_channel_allowlist")
            .select("channel_id");
          if (error) throw new Error(error.message);
          return ((data ?? []) as Array<{ channel_id: string }>).map(
            (r) => r.channel_id,
          );
        },
        loadSelfUserId: async () => {
          const { data, error } = await service
            .from("provider_accounts")
            .select("account_id")
            .eq("provider", "slack")
            .maybeSingle();
          if (error) throw new Error(error.message);
          return (data?.account_id as string | null) ?? null;
        },
        onStored: async (signal) => {
          await dispatchUpsertedSignal(signal, service, dispatcher);
        },
      });
      if (outcome.kind === "challenge") {
        return new Response(outcome.challenge, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      if (outcome.kind === "rejected") {
        return new Response(outcome.reason, { status: outcome.status });
      }
      return new Response(null, { status: 204 });
    }

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

    if (url.pathname === "/api/preferences") {
      if (request.method === "GET") {
        const channels = await loadAlertChannels(service);
        return json({ alert_channels: channels });
      }
      if (request.method === "PUT") {
        let body: { alert_channels?: unknown };
        try {
          body = (await request.json()) as { alert_channels?: unknown };
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const channels = sanitizeChannels(body.alert_channels);
        const { error } = await service
          .from("user_preferences")
          .update({
            alert_channels: channels,
            updated_at: new Date().toISOString(),
          })
          .eq("id", true);
        if (error) return json({ error: error.message }, 500);
        return json({ alert_channels: channels });
      }
    }

    if (
      url.pathname === "/api/notifications/test" &&
      request.method === "POST"
    ) {
      return handleTestNotification(service, env);
    }

    if (url.pathname === "/api/focus" && request.method === "POST") {
      return handleStartFocus(request, service);
    }

    if (url.pathname === "/api/ai/settings") {
      const deps = aiDeps(service, env);
      if (request.method === "GET") {
        const view = await getAiSettings(deps);
        return json(view);
      }
      if (request.method === "PUT") {
        let body: PutBody;
        try {
          body = (await request.json()) as PutBody;
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const out = await putAiSettings(body, deps);
        if (!out.ok) return json({ error: out.error }, 400);
        return json(out.settings);
      }
    }

    if (url.pathname === "/api/ai/test" && request.method === "POST") {
      const out = await testAiConnection(aiDeps(service, env));
      return json(out, out.ok ? 200 : 502);
    }

    if (
      url.pathname === "/api/briefing/generate" &&
      request.method === "POST"
    ) {
      let body: { date?: unknown; force?: unknown };
      try {
        body = (await request.json()) as { date?: unknown; force?: unknown };
      } catch {
        return json({ ok: false, reason: "error", error: "invalid json" }, 400);
      }
      const out = await handleBriefingGenerate(
        body,
        briefingDeps(service, env),
      );
      return json(out, out.ok ? 200 : out.reason === "error" ? 400 : 200);
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(
    _event: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const service = serviceClient(env);
    const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init);
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
        fetch: fetchImpl,
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

    const dispatcher = buildDispatcherDeps(service, fetchImpl);
    ctx.waitUntil(
      runMeetingAlertTick({
        loadUpcomingMeetings: () => loadUpcomingMeetings(service),
        dispatcher,
      })
        .then((report) => {
          for (const d of report.dispatched) {
            console.log(
              `[cron] meeting-alert ${d.signalId}: ${JSON.stringify(d.result)}`,
            );
          }
        })
        .catch((err) => {
          console.error("[cron] meeting-alert tick failed", err);
        }),
    );
  },
} satisfies ExportedHandler<WorkerEnv>;

const KNOWN_CHANNELS: AlertChannel[] = ["slack_dm"];

async function loadAlertChannels(service: SupabaseService): Promise<string[]> {
  const { data, error } = await service
    .from("user_preferences")
    .select("alert_channels")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.alert_channels ?? []) as string[]).filter((c) =>
    (KNOWN_CHANNELS as string[]).includes(c),
  );
}

function sanitizeChannels(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (!(KNOWN_CHANNELS as string[]).includes(v)) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

async function handleTestNotification(
  service: SupabaseService,
  _env: WorkerEnv,
): Promise<Response> {
  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token, account_id")
    .eq("provider", "slack")
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!data?.access_token || !data?.account_id) {
    return json({ ok: false, error: "slack not connected" }, 400);
  }
  const stub: StoredSignal = {
    id: "test",
    provider: "slack",
    kind: "mention",
    source_id: "test",
    title: "Test notification from Clearday",
    url: null,
    payload: {},
    requires_action: true,
    source_created_at: null,
    unread_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    dismissed_at: null,
  };
  try {
    await sendSlackDm(stub, {
      accessToken: data.access_token as string,
      selfUserId: data.account_id as string,
      fetch: (i, init) => fetch(i, init),
    });
    return json({ ok: true });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
}

async function handleStartFocus(
  request: Request,
  service: SupabaseService,
): Promise<Response> {
  let body: { duration_minutes?: unknown; message?: unknown };
  try {
    body = (await request.json()) as {
      duration_minutes?: unknown;
      message?: unknown;
    };
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const duration = Number(body.duration_minutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return json({ error: "duration_minutes must be a positive number" }, 400);
  }
  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message.trim()
      : undefined;

  const tokens = await loadFocusTokens(service);
  const result = await startFocusSession(
    { duration_minutes: duration, message },
    { tokens, fetch: (i, init) => fetch(i, init) },
  );
  return json(result);
}

async function loadFocusTokens(
  service: SupabaseService,
): Promise<{ google: string | null; slack: string | null }> {
  const { data, error } = await service
    .from("provider_accounts")
    .select("provider, access_token");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    provider: string;
    access_token: string | null;
  }>;
  const find = (p: string) =>
    rows.find((r) => r.provider === p)?.access_token ?? null;
  return { google: find("google"), slack: find("slack") };
}

const AI_SETTINGS_COLUMNS =
  "provider, model, api_key, base_url, last_validated_at, " +
  "monthly_budget_usd, fallback_model, privacy_mode, redact_patterns, ai_disabled";

function aiSettingsStore(service: SupabaseService): AiSettingsStore {
  return {
    load: async () => {
      const { data, error } = await service
        .from("ai_settings")
        .select(AI_SETTINGS_COLUMNS)
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as AiSettingsRow | null;
    },
    save: async (patch) => {
      const { data, error } = await service
        .from("ai_settings")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
        .select(AI_SETTINGS_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return data as AiSettingsRow;
    },
  };
}

function briefingDeps(service: SupabaseService, env: WorkerEnv): BriefingDeps {
  return {
    aiStore: aiSettingsStore(service),
    usageStore: service,
    keySecret: env.AI_KEY_SECRET,
    fetch: (i, init) => fetch(i, init),
    cacheStore: {
      load: async () => {
        const { data, error } = await service
          .from("user_preferences")
          .select("briefing")
          .eq("id", true)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const cached = (data?.briefing ?? null) as {
          date?: string;
          text?: string;
        } | null;
        if (
          !cached ||
          typeof cached.date !== "string" ||
          typeof cached.text !== "string"
        ) {
          return null;
        }
        return cached as Awaited<
          ReturnType<BriefingDeps["cacheStore"]["load"]>
        >;
      },
      save: async (entry) => {
        const { error } = await service
          .from("user_preferences")
          .update({
            briefing: entry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", true);
        if (error) throw new Error(error.message);
      },
    },
    loadSignals: async () => {
      const { data, error } = await service
        .from("signals")
        .select("*")
        .is("dismissed_at", null)
        .order("source_created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<
        Awaited<ReturnType<BriefingDeps["loadSignals"]>>[number]
      >;
    },
  };
}

function aiDeps(service: SupabaseService, env: WorkerEnv) {
  return {
    store: aiSettingsStore(service),
    usageStore: service,
    keySecret: env.AI_KEY_SECRET,
    fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, init),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: thin Supabase client surface
type SupabaseService = any;

function serviceClient(env: WorkerEnv): SupabaseService {
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
