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
import { runAlertQueueDrain } from "#/lib/alert-queue-drain";
import { type AskAiDeps, handleAskAi } from "#/lib/ask-ai-api";
import { type BriefingDeps, handleBriefingGenerate } from "#/lib/briefing-api";
import {
  type EmailDigestDeps,
  type EmailDigestPutBody,
  type EmailDigestRow,
  type EmailDigestStore,
  getEmailDigestSettings,
  putEmailDigestSettings,
  runEmailDigestTick,
  sendEmailDigestTest,
} from "#/lib/email-digest-api";
import { startFocusSession } from "#/lib/focus-session";
import {
  getInboxRules,
  type InboxRulesStore,
  putInboxRules,
} from "#/lib/inbox-rules-api";
import type { InboxRule } from "#/lib/inbox-rules-engine";
import { runMeetingAlertTick } from "#/lib/meeting-alert-tick";
import { handleOAuthExchange } from "#/lib/oauth-exchange-handler";
import {
  buildConnectUrl,
  completeOnboarding,
  getOnboardingStatus,
} from "#/lib/onboarding-api";
import {
  getProfile,
  type ProfilePutBody,
  type ProfileStore,
  type ProfileView,
  putProfile,
} from "#/lib/profile-api";
import type { StoredSignal } from "#/lib/signal";
import { runDueRollups } from "#/lib/signal-rollup";
import { handleSlackWebhook } from "#/lib/slack-webhook";
import {
  DEFAULT_THEME,
  getTheme,
  putTheme,
  type ThemePutBody,
  type ThemeStore,
  type ThemeView,
} from "#/lib/theme-api";
import {
  type DeviceView,
  listDevices,
  subscribe,
  unsubscribe,
  type WebPushSubscriptionStore,
} from "#/lib/web-push-api";
import type { VapidConfig } from "#/lib/web-push-vapid";
import {
  buildDispatcherDeps,
  dispatchUpsertedSignal,
  loadDueQueuedAlerts,
  loadUpcomingMeetings,
  removeQueuedAlert,
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
      const service = serviceClient(env);
      const dispatcher = buildDispatcherDeps(
        service,
        (i, init) => fetch(i, init),
        vapidFromEnv(env),
      );
      const outcome = await handleSlackWebhook(request, {
        signingSecret: env.SLACK_SIGNING_SECRET,
        store: service,
        loadInboxRules: () => loadInboxRulesFromService(service),
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
      return handleOAuthExchange(request, env, {
        fetch: (input, init) => fetch(input, init),
        persist: persistProviderAccount(env),
      });
    }

    if (!url.pathname.startsWith("/api/")) {
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
        return json(await loadFullPreferences(service));
      }
      if (request.method === "PUT") {
        let body: PreferencesPutBody;
        try {
          body = (await request.json()) as PreferencesPutBody;
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        return await handlePreferencesPut(body, service);
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

    if (url.pathname === "/api/ai/ask" && request.method === "POST") {
      let body: { q?: unknown; signal_ids?: unknown };
      try {
        body = (await request.json()) as { q?: unknown; signal_ids?: unknown };
      } catch {
        return json({ ok: false, reason: "error", error: "invalid json" }, 400);
      }
      const out = await handleAskAi(body, askAiDeps(service, env));
      return json(out, out.ok ? 200 : out.reason === "error" ? 400 : 200);
    }

    if (url.pathname === "/api/inbox-rules") {
      const store = inboxRulesStore(service);
      if (request.method === "GET") {
        return json(await getInboxRules(store));
      }
      if (request.method === "PUT") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putInboxRules(body, store);
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, rules: out.rules });
      }
    }

    if (url.pathname === "/api/push/public-key" && request.method === "GET") {
      return json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });
    }

    if (
      url.pathname === "/api/push/subscriptions" &&
      request.method === "GET"
    ) {
      const out = await listDevices(webPushStore(service));
      return json(out);
    }

    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid json" }, 400);
      }
      const out = await subscribe(
        body as Parameters<typeof subscribe>[0],
        webPushStore(service),
      );
      if (!out.ok) return json({ ok: false, error: out.error }, 400);
      return json({ ok: true, device: out.device });
    }

    const pushUnsubMatch = url.pathname.match(
      /^\/api\/push\/subscriptions\/([^/]+)$/,
    );
    if (pushUnsubMatch && request.method === "DELETE") {
      const out = await unsubscribe(pushUnsubMatch[1], webPushStore(service));
      return json(out);
    }

    if (url.pathname === "/api/email-digest") {
      const store = emailDigestStore(service);
      if (request.method === "GET") {
        return json(await getEmailDigestSettings(store));
      }
      if (request.method === "PUT") {
        let body: EmailDigestPutBody;
        try {
          body = (await request.json()) as EmailDigestPutBody;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putEmailDigestSettings(body, {
          store,
          keySecret: env.AI_KEY_SECRET,
        });
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, settings: out.settings });
      }
    }

    if (
      url.pathname === "/api/email-digest/test" &&
      request.method === "POST"
    ) {
      const out = await sendEmailDigestTest(emailDigestDeps(service, env));
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

    if (url.pathname === "/api/onboarding/status" && request.method === "GET") {
      const status = await getOnboardingStatus({
        loadOnboardedAt: () => loadOnboardedAt(service),
        countConnectedProviders: () => countConnectedProviders(service),
        authProxyUrl: env.AUTH_PROXY_URL ?? null,
      });
      return json(status);
    }

    if (
      url.pathname === "/api/onboarding/complete" &&
      request.method === "POST"
    ) {
      const out = await completeOnboarding({
        setOnboardedAt: (iso) => setOnboardedAt(service, iso),
      });
      return json(out);
    }

    const connectMatch = url.pathname.match(
      /^\/api\/providers\/([^/]+)\/connect-url$/,
    );
    if (connectMatch && request.method === "GET") {
      const out = buildConnectUrl(connectMatch[1], env.AUTH_PROXY_URL ?? null);
      if (!out.ok) return json({ ok: false, error: out.error }, 400);
      return json({ ok: true, url: out.url });
    }

    if (url.pathname === "/api/profile") {
      const store = profileStore(service);
      if (request.method === "GET") {
        return json(await getProfile(store));
      }
      if (request.method === "PUT") {
        let body: ProfilePutBody;
        try {
          body = (await request.json()) as ProfilePutBody;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putProfile(body, store);
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, profile: out.profile });
      }
    }

    if (url.pathname === "/api/theme") {
      const store = themeStore(service);
      if (request.method === "GET") {
        return json(await getTheme(store));
      }
      if (request.method === "PUT") {
        let body: ThemePutBody;
        try {
          body = (await request.json()) as ThemePutBody;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putTheme(body, store);
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, theme: out.theme });
      }
    }

    if (url.pathname === "/api/slack/allowlist") {
      if (request.method === "GET") {
        return json({ channels: await loadSlackAllowlist(service) });
      }
      if (request.method === "PUT") {
        let body: { channels?: unknown };
        try {
          body = (await request.json()) as { channels?: unknown };
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const channels = sanitizeAllowlist(body.channels);
        await replaceSlackAllowlist(service, channels);
        return json({ ok: true, channels });
      }
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
        loadInboxRules: () => loadInboxRulesFromService(service),
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

    const dispatcher = buildDispatcherDeps(
      service,
      fetchImpl,
      vapidFromEnv(env),
    );
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

    ctx.waitUntil(
      runDueRollups(rollupDeps(service))
        .then((reports) => {
          for (const r of reports) {
            if (r.rolledKinds > 0 || r.rawDeleted > 0) {
              console.log(
                `[cron] rollup ${r.period} ${r.periodStart}: kinds=${r.rolledKinds} raw_deleted=${r.rawDeleted}`,
              );
            }
          }
        })
        .catch((err) => {
          console.error("[cron] rollup failed", err);
        }),
    );

    ctx.waitUntil(
      runEmailDigestTick(emailDigestDeps(service, env))
        .then((report) => {
          if (report.kind === "sent") {
            console.log(
              `[cron] email-digest: sent to ${report.recipient} (${report.signal_count} signals)`,
            );
          } else if (report.kind === "error") {
            console.warn(`[cron] email-digest: ${report.error}`);
          }
        })
        .catch((err) => {
          console.error("[cron] email-digest failed", err);
        }),
    );

    ctx.waitUntil(
      runAlertQueueDrain({
        loadDue: (now) => loadDueQueuedAlerts(service, now),
        removeQueued: (signalId, threshold) =>
          removeQueuedAlert(service, signalId, threshold),
        dispatcher,
      })
        .then((report) => {
          for (const d of report.delivered) {
            console.log(
              `[cron] queue-drain ${d.signalId}: fired=${d.fired.join(",")}`,
            );
          }
        })
        .catch((err) => {
          console.error("[cron] queue-drain failed", err);
        }),
    );
  },
} satisfies ExportedHandler<WorkerEnv>;

const KNOWN_CHANNELS: AlertChannel[] = [
  "slack_dm",
  "web_push",
  "email",
  "desktop",
];

const PREFERENCES_COLUMNS =
  "alert_channels, notification_matrix, quiet_hours_v2, focus_block";

type PreferencesPutBody = {
  alert_channels?: unknown;
  notification_matrix?: unknown;
  quiet_hours_v2?: unknown;
  focus_block?: unknown;
};

async function loadFullPreferences(service: SupabaseService): Promise<{
  alert_channels: string[];
  notification_matrix: Record<string, string[]>;
  quiet_hours_v2: Record<string, unknown>;
  focus_block: Record<string, unknown>;
}> {
  const { data, error } = await service
    .from("user_preferences")
    .select(PREFERENCES_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as {
    alert_channels?: string[];
    notification_matrix?: Record<string, string[]>;
    quiet_hours_v2?: Record<string, unknown>;
    focus_block?: Record<string, unknown>;
  };
  return {
    alert_channels: (row.alert_channels ?? []).filter((c) =>
      (KNOWN_CHANNELS as string[]).includes(c),
    ),
    notification_matrix: row.notification_matrix ?? {},
    quiet_hours_v2: row.quiet_hours_v2 ?? {},
    focus_block: row.focus_block ?? {},
  };
}

async function handlePreferencesPut(
  body: PreferencesPutBody,
  service: SupabaseService,
): Promise<Response> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.alert_channels !== undefined) {
    patch.alert_channels = sanitizeChannels(body.alert_channels);
  }
  if (body.notification_matrix !== undefined) {
    patch.notification_matrix = sanitizeMatrixForPut(body.notification_matrix);
  }
  if (body.quiet_hours_v2 !== undefined) {
    if (
      typeof body.quiet_hours_v2 !== "object" ||
      body.quiet_hours_v2 === null ||
      Array.isArray(body.quiet_hours_v2)
    ) {
      return json({ error: "quiet_hours_v2 must be an object" }, 400);
    }
    patch.quiet_hours_v2 = body.quiet_hours_v2;
  }
  if (body.focus_block !== undefined) {
    if (
      typeof body.focus_block !== "object" ||
      body.focus_block === null ||
      Array.isArray(body.focus_block)
    ) {
      return json({ error: "focus_block must be an object" }, 400);
    }
    patch.focus_block = body.focus_block;
  }
  const { error } = await service
    .from("user_preferences")
    .update(patch)
    .eq("id", true);
  if (error) return json({ error: error.message }, 500);
  return json(await loadFullPreferences(service));
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

function sanitizeMatrixForPut(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    out[k] = v.filter(
      (c): c is string =>
        typeof c === "string" && (KNOWN_CHANNELS as string[]).includes(c),
    );
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

const PROFILE_COLUMNS = "display_name, timezone, locale, avatar_url";

function profileStore(service: SupabaseService): ProfileStore {
  return {
    load: async () => {
      const { data, error } = await service
        .from("user_preferences")
        .select(PROFILE_COLUMNS)
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Partial<ProfileView>;
      return {
        display_name: row.display_name ?? null,
        timezone: row.timezone ?? null,
        locale: row.locale ?? null,
        avatar_url: row.avatar_url ?? null,
      };
    },
    save: async (patch) => {
      const { error } = await service
        .from("user_preferences")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw new Error(error.message);
      const { data, error: readErr } = await service
        .from("user_preferences")
        .select(PROFILE_COLUMNS)
        .eq("id", true)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      const row = (data ?? {}) as Partial<ProfileView>;
      return {
        display_name: row.display_name ?? null,
        timezone: row.timezone ?? null,
        locale: row.locale ?? null,
        avatar_url: row.avatar_url ?? null,
      };
    },
  };
}

const THEME_COLUMNS = "theme, density, accent";

function themeStore(service: SupabaseService): ThemeStore {
  const read = async (): Promise<ThemeView> => {
    const { data, error } = await service
      .from("user_preferences")
      .select(THEME_COLUMNS)
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as Partial<ThemeView>;
    return {
      theme: row.theme ?? DEFAULT_THEME.theme,
      density: row.density ?? DEFAULT_THEME.density,
      accent: row.accent ?? DEFAULT_THEME.accent,
    };
  };
  return {
    load: read,
    save: async (patch) => {
      const { error } = await service
        .from("user_preferences")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw new Error(error.message);
      return read();
    },
  };
}

async function loadOnboardedAt(
  service: SupabaseService,
): Promise<string | null> {
  const { data, error } = await service
    .from("user_preferences")
    .select("onboarded_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.onboarded_at as string | null) ?? null;
}

async function setOnboardedAt(
  service: SupabaseService,
  iso: string,
): Promise<void> {
  const { error } = await service
    .from("user_preferences")
    .update({ onboarded_at: iso, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(error.message);
}

async function countConnectedProviders(
  service: SupabaseService,
): Promise<number> {
  const { data, error } = await service
    .from("provider_accounts")
    .select("provider");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ provider: string }>).length;
}

async function loadSlackAllowlist(service: SupabaseService): Promise<string[]> {
  const { data, error } = await service
    .from("slack_channel_allowlist")
    .select("channel_id");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ channel_id: string }>).map(
    (r) => r.channel_id,
  );
}

function sanitizeAllowlist(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

async function replaceSlackAllowlist(
  service: SupabaseService,
  channels: string[],
): Promise<void> {
  const { error: delError } = await service
    .from("slack_channel_allowlist")
    .delete()
    .neq("channel_id", "__sentinel__");
  if (delError) throw new Error(delError.message);
  if (channels.length === 0) return;
  const { error: insError } = await service
    .from("slack_channel_allowlist")
    .insert(channels.map((channel_id) => ({ channel_id })));
  if (insError) throw new Error(insError.message);
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

function askAiDeps(service: SupabaseService, env: WorkerEnv): AskAiDeps {
  return {
    aiStore: aiSettingsStore(service),
    usageStore: service,
    keySecret: env.AI_KEY_SECRET,
    fetch: (i, init) => fetch(i, init),
    loadSignals: async (signalIds) => {
      let q = service.from("signals").select("*").is("dismissed_at", null);
      if (signalIds && signalIds.length > 0) q = q.in("id", signalIds);
      const { data, error } = await q
        .order("source_created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<
        Awaited<ReturnType<AskAiDeps["loadSignals"]>>[number]
      >;
    },
  };
}

function rollupDeps(service: SupabaseService) {
  return {
    loadRawInRange: async (startIso: string, endIso: string) => {
      const { data, error } = await service
        .from("signals")
        .select("kind, created_at, dismissed_at, requires_action")
        .gte("created_at", startIso)
        .lt("created_at", endIso);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        kind: string;
        created_at: string;
        dismissed_at: string | null;
        requires_action: boolean;
      }>;
    },
    loadMonthRollupsInRange: async (startDate: string, endDate: string) => {
      const { data, error } = await service
        .from("signal_rollups")
        .select("period, period_start, kind, count, stats")
        .eq("period", "month")
        .gte("period_start", startDate)
        .lt("period_start", endDate);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{
        period: "month";
        period_start: string;
        kind: string;
        count: number;
        stats: Record<string, number>;
      }>;
    },
    upsertRollup: async (row: {
      period: string;
      period_start: string;
      kind: string;
      count: number;
      stats: Record<string, number>;
    }) => {
      const { error } = await service.from("signal_rollups").upsert(row, {
        onConflict: "period,period_start,kind",
      });
      if (error) throw new Error(error.message);
    },
    deleteRawInRange: async (startIso: string, endIso: string) => {
      const { data, error } = await service
        .from("signals")
        .delete()
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .select("id");
      if (error) throw new Error(error.message);
      return (data ?? []).length;
    },
  };
}

async function loadInboxRulesFromService(
  service: SupabaseService,
): Promise<InboxRule[]> {
  const { data, error } = await service
    .from("inbox_rules")
    .select("id, name, enabled, priority, match, action")
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    match: { predicates?: InboxRule["predicates"] } | null;
    action: { effects?: InboxRule["effects"] } | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    predicates: r.match?.predicates ?? [],
    effects: r.action?.effects ?? [],
  }));
}

function inboxRulesStore(service: SupabaseService): InboxRulesStore {
  return {
    load: () => loadInboxRulesFromService(service),
    save: async (rules) => {
      // Delete then insert: simplest correct semantics for "replace whole list".
      const { error: delError } = await service
        .from("inbox_rules")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (delError) throw new Error(delError.message);
      if (rules.length === 0) return [];
      const rows = rules.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        priority: r.priority,
        match: { predicates: r.predicates },
        action: { effects: r.effects },
      }));
      const { error: insError } = await service
        .from("inbox_rules")
        .insert(rows);
      if (insError) throw new Error(insError.message);
      return loadInboxRulesFromService(service);
    },
  };
}

function emailDigestStore(service: SupabaseService): EmailDigestStore {
  return {
    load: async () => {
      const { data, error } = await service
        .from("user_preferences")
        .select("email_digest")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.email_digest as EmailDigestRow | null) ?? null;
    },
    save: async (patch) => {
      // Read-modify-write: blob is JSONB, no per-field upsert support.
      const { data: existing, error: readErr } = await service
        .from("user_preferences")
        .select("email_digest")
        .eq("id", true)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      const merged: EmailDigestRow = {
        ...((existing?.email_digest as EmailDigestRow | null) ?? {}),
        ...patch,
      };
      const { error } = await service
        .from("user_preferences")
        .update({
          email_digest: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw new Error(error.message);
      return merged;
    },
  };
}

function emailDigestDeps(
  service: SupabaseService,
  env: WorkerEnv,
): EmailDigestDeps {
  return {
    store: emailDigestStore(service),
    keySecret: env.AI_KEY_SECRET,
    fetch: (i, init) => fetch(i, init),
    loadSignals: async (sinceIso) => {
      let q = service.from("signals").select("*").is("dismissed_at", null);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<
        Awaited<ReturnType<EmailDigestDeps["loadSignals"]>>[number]
      >;
    },
  };
}

function vapidFromEnv(env: WorkerEnv): VapidConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return null;
  }
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

function webPushStore(service: SupabaseService): WebPushSubscriptionStore {
  return {
    list: async () => {
      const { data, error } = await service
        .from("web_push_subscriptions")
        .select("id, endpoint, device_label, last_delivered_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DeviceView[];
    },
    upsert: async (input) => {
      const { data, error } = await service
        .from("web_push_subscriptions")
        .upsert(
          {
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            user_agent: input.user_agent,
            device_label: input.device_label,
          },
          { onConflict: "endpoint" },
        )
        .select("id, endpoint, device_label, last_delivered_at, created_at")
        .single();
      if (error) throw new Error(error.message);
      return data as DeviceView;
    },
    remove: async (id) => {
      const { data, error } = await service
        .from("web_push_subscriptions")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      return { removed: (data ?? []).length > 0 };
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

function env_assets_fetch(
  env: WorkerEnv,
  request: Request,
): Response | Promise<Response> {
  const assets = (env as unknown as { ASSETS?: Fetcher }).ASSETS;
  if (assets) return assets.fetch(request);
  return json({ error: "not found" }, 404);
}
