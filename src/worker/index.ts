/// <reference types="@cloudflare/workers-types" />
import { createClient } from "@supabase/supabase-js";
import {
  type AiSettingsRow,
  type AiSettingsStore,
  getAiSettings,
  type PutBody,
  putAiSettings,
  testAiConnection,
} from "#/features/ai/api/settings";
import {
  type DeviceView,
  listDevices,
  renameDevice,
  subscribe,
  unsubscribe,
  type WebPushSubscriptionStore,
} from "#/features/alerts/channels/web-push/api";
import { pruneStaleWebPushSubscriptions } from "#/features/alerts/channels/web-push/subscriptions";
import type { VapidConfig } from "#/features/alerts/channels/web-push/vapid";
import { type AlertChannel, fireChannels } from "#/features/alerts/dispatcher";
import {
  buildDispatcherDeps,
  loadDueQueuedAlerts,
  loadUpcomingMeetings,
  removeQueuedAlert,
} from "#/features/alerts/server/glue";
import { runMeetingAlertTick } from "#/features/alerts/server/meeting-tick";
import { runAlertQueueDrain } from "#/features/alerts/server/queue-drain";
import { type AskAiDeps, handleAskAi } from "#/features/ask-ai/api";
import { isAllowedEmail } from "#/features/auth/gate";
import {
  type AutomationRunRow,
  type AutomationRunsReader,
  type AutomationsStore,
  dryRunAutomation,
  getAutomations,
  listAutomationRuns,
  listLatestFailures,
  putAutomations,
} from "#/features/automations/api";
import type { Automation } from "#/features/automations/engine";
import type {
  AutomationRunInsert,
  AutomationRunsStore,
  AutomationRunStatus,
  ExecutedAction,
} from "#/features/automations/executor";
import {
  type BriefingDeps,
  handleBriefingGenerate,
  runBriefingTick,
} from "#/features/briefing/api";
import {
  type DraftReplyDeps,
  handleDraftReply,
} from "#/features/draft-reply/api";
import {
  type EmailDigestDeps,
  type EmailDigestPutBody,
  type EmailDigestRow,
  type EmailDigestStore,
  getEmailDigestSettings,
  putEmailDigestSettings,
  runEmailDigestTick,
  sendEmailDigestTest,
} from "#/features/email-digest/api";
import { startFocusSession } from "#/features/focus/session";
import {
  disconnectIntegration,
  getIntegrations,
  type IntegrationsStore,
  type ProviderAccountRow,
} from "#/features/integrations/api/integrations-api";
import { runScheduledPoll } from "#/features/integrations/orchestrator";
import { runScheduleAutomations } from "#/features/automations/orchestrator";
import { PROVIDERS } from "#/features/integrations/providers";
import type { PrReviewEvent } from "#/features/integrations/providers/github";
import { handleOAuthExchange } from "#/features/integrations/server/oauth-exchange-handler";
import {
  buildConnectUrl,
  completeOnboarding,
  getOnboardingStatus,
} from "#/features/onboarding/api";
import {
  type ExportDeps,
  exportData,
  getRetention,
  type PurgeBody,
  type PurgeDeps,
  purgeData,
  putRetention,
  type RetentionPutBody,
  type RetentionStore,
  type RetentionView,
} from "#/features/settings/data-privacy/api";
import {
  getProfile,
  type ProfilePutBody,
  type ProfileStore,
  type ProfileView,
  putProfile,
} from "#/features/settings/profile/api";
import {
  getSelfHostInfo,
  runHealthCheck,
  type SelfHostEnv,
} from "#/features/settings/self-host/api";
import {
  DEFAULT_THEME,
  getTheme,
  putTheme,
  type ThemePutBody,
  type ThemeStore,
  type ThemeView,
} from "#/features/settings/theme/api";
import { runDueRollups } from "#/features/signals/rollup";
import {
  handleDismissSignal,
  handleListSignals,
  handleSources,
} from "#/features/signals/server/api";
import { dismissSignal, markSignalReplied } from "#/features/signals/store";
import type { StoredSignal } from "#/shared/signal";
import {
  defaultGetUser,
  json,
  requireAllowedUser,
  type WorkerEnv,
} from "#/worker/middleware";
import { persistProviderAccount } from "#/worker/provider-accounts";

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/oauth/exchange") {
      return handleOAuthExchange(request, env, {
        persist: persistProviderAccount(env),
      });
    }

    if (!url.pathname.startsWith("/api/")) {
      return env_assets_fetch(env, request);
    }

    // Image-proxy auth runs from query string (browsers can't put a bearer
    // header on a plain <img> request). Authenticate inline before the
    // global gate so an unauthorized caller still gets 401, but via the
    // ?auth= token rather than the Authorization header.
    if (url.pathname === "/api/github/asset" && request.method === "GET") {
      const queryToken = url.searchParams.get("auth") ?? "";
      const getUser = defaultGetUser(env);
      const user = queryToken ? await getUser(queryToken) : null;
      if (!user) return json({ error: "missing or invalid token" }, 401);
      if (!isAllowedEmail(user.email, env.ALLOWED_EMAIL)) {
        return json({ error: "not authorized for this deployment" }, 403);
      }
      return handleGetGithubAsset(url, serviceClient(env));
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
          .select("provider, account_id, updated_at, status, last_polled_at");
        if (error) throw new Error(error.message);
        return (data ?? []) as Array<{
          provider: string;
          account_id: string | null;
          updated_at: string | null;
          status: string | null;
          last_polled_at: string | null;
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

    if (url.pathname === "/api/pr/review" && request.method === "POST") {
      return handleSubmitPrReview(request, service);
    }

    if (url.pathname === "/api/pr/files" && request.method === "GET") {
      return handleGetPrFiles(url, service);
    }

    if (url.pathname === "/api/pr/overview" && request.method === "GET") {
      return handleGetPrOverview(url, service);
    }

    if (url.pathname === "/api/slack/reply" && request.method === "POST") {
      return handlePostSlackReply(request, service);
    }

    if (url.pathname === "/api/slack/thread" && request.method === "GET") {
      return handleGetSlackThread(url, service);
    }

    if (url.pathname === "/api/calendar/decline" && request.method === "POST") {
      return handleDeclineCalendarEvent(request, service);
    }

    if (
      url.pathname === "/api/calendar/reschedule" &&
      request.method === "POST"
    ) {
      return handleRescheduleCalendarEvent(request, service);
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

    if (url.pathname === "/api/ai/draft" && request.method === "POST") {
      let body: { signal_id?: unknown; instruction?: unknown };
      try {
        body = (await request.json()) as {
          signal_id?: unknown;
          instruction?: unknown;
        };
      } catch {
        return json({ ok: false, reason: "error", error: "invalid json" }, 400);
      }
      const out = await handleDraftReply(body, draftReplyDeps(service, env));
      return json(out, out.ok ? 200 : out.reason === "error" ? 400 : 200);
    }

    if (url.pathname === "/api/automations") {
      const store = automationsStore(service);
      if (request.method === "GET") {
        return json(await getAutomations(store));
      }
      if (request.method === "PUT") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putAutomations(body, store);
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, automations: out.automations });
      }
    }

    {
      const dryRunMatch = url.pathname.match(
        /^\/api\/automations\/([^/]+)\/dry-run$/,
      );
      if (dryRunMatch && request.method === "POST") {
        const automationId = decodeURIComponent(dryRunMatch[1] ?? "");
        const out = await dryRunAutomation(
          automationId,
          automationsStore(service),
          automationRunsStore(service),
        );
        if (!out.ok) {
          const status = out.error === "automation not found" ? 404 : 400;
          return json({ ok: false, error: out.error }, status);
        }
        return json({
          ok: true,
          automation_id: out.automation_id,
          status: out.status,
          actions_planned: out.actions_planned,
          trigger_event_id: out.trigger_event_id,
          started_at: out.started_at,
        });
      }
    }

    if (
      url.pathname === "/api/automations/runs/latest-failures" &&
      request.method === "GET"
    ) {
      const out = await listLatestFailures(automationRunsReader(service));
      if (!out.ok) return json({ ok: false, error: out.error }, 400);
      return json({ ok: true, failures: out.failures });
    }

    {
      const runsMatch = url.pathname.match(
        /^\/api\/automations\/([^/]+)\/runs$/,
      );
      if (runsMatch && request.method === "GET") {
        const automationId = decodeURIComponent(runsMatch[1] ?? "");
        const limitRaw = url.searchParams.get("limit");
        const before = url.searchParams.get("before") ?? undefined;
        const out = await listAutomationRuns(
          automationId,
          automationRunsReader(service),
          {
            limit: limitRaw === null ? undefined : Number(limitRaw),
            before,
          },
        );
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({
          ok: true,
          runs: out.runs,
          next_cursor: out.next_cursor,
        });
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
    if (pushUnsubMatch && request.method === "PATCH") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid json" }, 400);
      }
      const out = await renameDevice(
        pushUnsubMatch[1],
        body as Parameters<typeof renameDevice>[1],
        webPushStore(service),
      );
      if (!out.ok)
        return json({ ok: false, error: out.error }, out.status ?? 400);
      return json({ ok: true, device: out.device });
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
      const host =
        request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const userBackendUrl = host ? `https://${host}` : null;
      const out = buildConnectUrl(
        connectMatch[1],
        env.AUTH_PROXY_URL ?? null,
        userBackendUrl,
      );
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

    if (url.pathname === "/api/data/export" && request.method === "GET") {
      const payload = await exportData(dataPrivacyDeps(service));
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="clearday-export.json"',
        },
      });
    }

    if (url.pathname === "/api/data/purge" && request.method === "POST") {
      let body: PurgeBody;
      try {
        body = (await request.json()) as PurgeBody;
      } catch {
        return json({ ok: false, error: "invalid json" }, 400);
      }
      const out = await purgeData(body, purgeDeps(service));
      if (!out.ok) return json({ ok: false, error: out.error }, 400);
      return json({ ok: true, deleted: out.deleted });
    }

    if (url.pathname === "/api/retention") {
      const store = retentionStore(service);
      if (request.method === "GET") {
        return json(await getRetention(store));
      }
      if (request.method === "PUT") {
        let body: RetentionPutBody;
        try {
          body = (await request.json()) as RetentionPutBody;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        const out = await putRetention(body, store);
        if (!out.ok) return json({ ok: false, error: out.error }, 400);
        return json({ ok: true, retention: out.retention });
      }
    }

    if (url.pathname === "/api/self-host" && request.method === "GET") {
      return json(
        getSelfHostInfo(env as SelfHostEnv, `${url.protocol}//${url.host}`),
      );
    }

    if (url.pathname === "/api/self-host/health" && request.method === "POST") {
      const out = await runHealthCheck({
        env: env as SelfHostEnv,
        pingDatabase: () => pingDatabase(service),
      });
      return json(out, out.ok ? 200 : 502);
    }

    if (url.pathname === "/api/integrations" && request.method === "GET") {
      return json(await getIntegrations(integrationsStore(service)));
    }

    const disconnectMatch = url.pathname.match(
      /^\/api\/integrations\/([^/]+)$/,
    );
    if (disconnectMatch && request.method === "DELETE") {
      const out = await disconnectIntegration(
        disconnectMatch[1],
        integrationsStore(service),
      );
      if (!out.ok) return json({ ok: false, error: out.error }, 400);
      return json({ ok: true, provider: out.provider });
    }

    if (url.pathname === "/api/slack/channels" && request.method === "GET") {
      const { data, error } = await service
        .from("provider_accounts")
        .select("access_token")
        .eq("provider", "slack")
        .maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      const token =
        (data as { access_token: string | null } | null)?.access_token ?? null;
      const out = await PROVIDERS.slack.capabilities.listChannels({
        token,
        fetch: (i, init) => fetch(i, init),
      });
      return json(out, out.ok ? 200 : 400);
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
        loadAutomations: () => loadAutomationsFromService(service),
        loadAccounts: async () => {
          const { data, error } = await service
            .from("provider_accounts")
            .select(
              "provider, access_token, refresh_token, expires_at, account_id",
            );
          if (error) throw new Error(error.message);
          return (data ?? []) as Array<{
            provider: string;
            access_token: string | null;
            refresh_token: string | null;
            expires_at: string | null;
            account_id: string | null;
          }>;
        },
        saveRefreshedToken: async ({
          provider,
          access_token,
          refresh_token,
          expires_at,
        }) => {
          const update: Record<string, unknown> = {
            access_token,
            expires_at,
            updated_at: new Date().toISOString(),
          };
          if (refresh_token) update.refresh_token = refresh_token;
          const { error } = await service
            .from("provider_accounts")
            .update(update)
            .eq("provider", provider);
          if (error) throw new Error(error.message);
        },
        saveProviderStatus: async (provider, status) => {
          const { error } = await service
            .from("provider_accounts")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("provider", provider);
          if (error) throw new Error(error.message);
        },
        saveLastPolledAt: async (provider) => {
          const { error } = await service
            .from("provider_accounts")
            .update({ last_polled_at: new Date().toISOString() })
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
          LINEAR_CLIENT_ID: env.LINEAR_CLIENT_ID,
          LINEAR_CLIENT_SECRET: env.LINEAR_CLIENT_SECRET,
          JIRA_CLIENT_ID: env.JIRA_CLIENT_ID,
          JIRA_CLIENT_SECRET: env.JIRA_CLIENT_SECRET,
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
      env.AI_KEY_SECRET ?? null,
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
      retentionStore(service)
        .load()
        .then((view) => runDueRollups(rollupDeps(service), view.retention_days))
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
      runBriefingTick(briefingDeps(service, env))
        .then((report) => {
          if (report.kind === "generated") {
            console.log(
              `[cron] briefing ${report.date}: ${report.cached ? "cache hit" : "generated"}`,
            );
          } else if (report.kind === "error") {
            console.warn(`[cron] briefing: ${report.error}`);
          }
        })
        .catch((err) => {
          console.error("[cron] briefing tick failed", err);
        }),
    );

    ctx.waitUntil(
      pruneStaleWebPushSubscriptions({
        loadStaleIds: async (cutoff) => {
          const iso = cutoff.toISOString();
          const { data, error } = await service
            .from("web_push_subscriptions")
            .select("id")
            .or(
              `last_delivered_at.lt.${iso},and(last_delivered_at.is.null,created_at.lt.${iso})`,
            );
          if (error) throw new Error(error.message);
          return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        },
        removeSubscription: async (id) => {
          const { error } = await service
            .from("web_push_subscriptions")
            .delete()
            .eq("id", id);
          if (error) throw new Error(error.message);
        },
      })
        .then((report) => {
          if (report.pruned.length > 0) {
            console.log(
              `[cron] web-push prune: removed ${report.pruned.length} stale subscriptions`,
            );
          }
        })
        .catch((err) => {
          console.error("[cron] web-push prune failed", err);
        }),
    );

    ctx.waitUntil(
      (async () => {
        const automations = await loadAutomationsFromService(service);
        const scheduleAutomations = automations.filter(
          (a) => a.enabled && a.trigger_kind === "schedule",
        );
        if (scheduleAutomations.length === 0) return;
        return runScheduleAutomations(
          new Date(),
          scheduleAutomations,
          automationRunsStore(service),
        );
      })()
        .then((report) => {
          if (!report) return;
          for (const r of report.results) {
            console.log(
              `[cron] automation-schedule ${report.minuteIso} ${r.automation_id}: ${r.status}`,
            );
          }
        })
        .catch((err) => {
          console.error("[cron] automation-schedule failed", err);
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
  "alert_channels, notification_matrix, quiet_hours_v2, focus_block, focus_defaults";

type PreferencesPutBody = {
  alert_channels?: unknown;
  notification_matrix?: unknown;
  quiet_hours_v2?: unknown;
  focus_block?: unknown;
  focus_defaults?: unknown;
};

async function loadFullPreferences(service: SupabaseService): Promise<{
  alert_channels: string[];
  notification_matrix: Record<string, string[]>;
  quiet_hours_v2: Record<string, unknown>;
  focus_block: Record<string, unknown>;
  focus_defaults: Record<string, unknown>;
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
    focus_defaults?: Record<string, unknown>;
  };
  return {
    alert_channels: (row.alert_channels ?? []).filter((c) =>
      (KNOWN_CHANNELS as string[]).includes(c),
    ),
    notification_matrix: row.notification_matrix ?? {},
    quiet_hours_v2: row.quiet_hours_v2 ?? {},
    focus_block: row.focus_block ?? {},
    focus_defaults: row.focus_defaults ?? {},
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
  if (body.focus_defaults !== undefined) {
    if (
      typeof body.focus_defaults !== "object" ||
      body.focus_defaults === null ||
      Array.isArray(body.focus_defaults)
    ) {
      return json({ error: "focus_defaults must be an object" }, 400);
    }
    patch.focus_defaults = body.focus_defaults;
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
  env: WorkerEnv,
): Promise<Response> {
  const dispatcher = buildDispatcherDeps(
    service,
    (i, init) => fetch(i, init),
    vapidFromEnv(env),
    env.AI_KEY_SECRET ?? null,
  );
  let prefs: { enabledChannels: AlertChannel[] };
  try {
    prefs = await dispatcher.loadPreferences();
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
  const candidates = prefs.enabledChannels.filter(
    (c) => dispatcher.channels[c],
  );
  if (candidates.length === 0) {
    return json({ ok: false, error: "no channels configured" }, 400);
  }
  const stub: StoredSignal = {
    id: `test:${Date.now()}`,
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
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
  };
  const result = await fireChannels(stub, candidates, dispatcher);
  const ok = result.fired.length > 0 && Object.keys(result.errors).length === 0;
  return json({
    ok,
    fired: result.fired,
    errors: result.errors,
  });
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
  const defaults = await loadFocusDefaults(service);
  const result = await startFocusSession(
    { duration_minutes: duration, message },
    {
      tokens,
      fetch: (i, init) => fetch(i, init),
      statusEmoji: defaults.status_emoji,
    },
  );
  return json(result);
}

async function handleSubmitPrReview(
  request: Request,
  service: SupabaseService,
): Promise<Response> {
  let body: {
    repo?: unknown;
    number?: unknown;
    event?: unknown;
    body?: unknown;
    signal_id?: unknown;
    comments?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const repo = typeof body.repo === "string" ? body.repo : "";
  const number = Number(body.number);
  const event = body.event as PrReviewEvent;
  const message = typeof body.body === "string" ? body.body : undefined;
  const signalId =
    typeof body.signal_id === "string" && body.signal_id.length > 0
      ? body.signal_id
      : null;
  const draftComments = Array.isArray(body.comments)
    ? body.comments.flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const c = raw as Record<string, unknown>;
        const path = typeof c.path === "string" ? c.path : "";
        const line = Number(c.line);
        const side =
          c.side === "LEFT" || c.side === "RIGHT"
            ? (c.side as "LEFT" | "RIGHT")
            : undefined;
        const draftBody = typeof c.body === "string" ? c.body : "";
        if (!path || !Number.isInteger(line) || !draftBody) return [];
        const startLineRaw = Number(c.start_line);
        const start_line =
          Number.isInteger(startLineRaw) && startLineRaw > 0
            ? startLineRaw
            : undefined;
        const start_side =
          c.start_side === "LEFT" || c.start_side === "RIGHT"
            ? (c.start_side as "LEFT" | "RIGHT")
            : undefined;
        return [{ path, line, side, start_line, start_side, body: draftBody }];
      })
    : [];

  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "github")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.github.capabilities.submitPrReview(
    { repo, number, event, body: message, comments: draftComments },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  if (out.ok && signalId) {
    await markSignalReplied(service, signalId);
  }
  return json(out, out.ok ? 200 : 400);
}

async function handleGetPrFiles(
  url: URL,
  service: SupabaseService,
): Promise<Response> {
  const repo = url.searchParams.get("repo") ?? "";
  const number = Number(url.searchParams.get("number"));
  if (!repo || !Number.isInteger(number) || number <= 0) {
    return json(
      { ok: false, error: "repo and number required", reason: "invalid_input" },
      400,
    );
  }
  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "github")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.github.capabilities.fetchPrFiles(
    { repo, number },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  return json(out, out.ok ? 200 : 400);
}

async function handleGetPrOverview(
  url: URL,
  service: SupabaseService,
): Promise<Response> {
  const repo = url.searchParams.get("repo") ?? "";
  const number = Number(url.searchParams.get("number"));
  if (!repo || !Number.isInteger(number) || number <= 0) {
    return json(
      { ok: false, error: "repo and number required", reason: "invalid_input" },
      400,
    );
  }
  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "github")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.github.capabilities.fetchPrOverview(
    { repo, number },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  return json(out, out.ok ? 200 : 400);
}

// Proxies images embedded in PR descriptions / comments. GitHub's
// user-attachments URLs require auth + carry CORP: same-origin, so the
// browser cannot load them cross-origin. We fetch with the user's token
// server-side and stream the bytes back as a plain image response.
const GITHUB_ASSET_HOST_ALLOWLIST = new Set([
  "github.com",
  "user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
]);

async function handleGetGithubAsset(
  url: URL,
  service: SupabaseService,
): Promise<Response> {
  const target = url.searchParams.get("url") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (
    parsed.protocol !== "https:" ||
    !GITHUB_ASSET_HOST_ALLOWLIST.has(parsed.hostname)
  ) {
    return new Response("host not allowed", { status: 400 });
  }

  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "github")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  // GitHub user-attachments return a 302 to a pre-signed CDN URL (e.g. on
  // private-user-images.githubusercontent.com). The CDN URL carries its own
  // auth in the query string and rejects an Authorization header with 401, so
  // we have to follow redirects manually and drop the bearer on the next hop.
  const baseHeaders: Record<string, string> = {
    "user-agent": "clearday-worker",
    accept: "image/*,video/*,*/*;q=0.8",
  };
  let currentUrl = parsed.toString();
  let useAuth = !!token;
  let upstream: Response | null = null;
  for (let i = 0; i < 5; i++) {
    const headers: Record<string, string> = { ...baseHeaders };
    if (useAuth && token) headers.authorization = `Bearer ${token}`;
    upstream = await fetch(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      const loc = upstream.headers.get("location");
      if (!loc) break;
      currentUrl = new URL(loc, currentUrl).toString();
      // After the first hop, the redirect target carries its own signed
      // credentials — sending our token would be rejected.
      useAuth = false;
      continue;
    }
    break;
  }
  if (!upstream) {
    return new Response("upstream error", { status: 502 });
  }
  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status,
    });
  }
  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=300",
    },
  });
}

async function handlePostSlackReply(
  request: Request,
  service: SupabaseService,
): Promise<Response> {
  let body: {
    channel?: unknown;
    text?: unknown;
    thread_ts?: unknown;
    signal_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const channel = typeof body.channel === "string" ? body.channel : "";
  const text = typeof body.text === "string" ? body.text : "";
  const thread_ts =
    typeof body.thread_ts === "string" && body.thread_ts.length > 0
      ? body.thread_ts
      : undefined;
  const signalId =
    typeof body.signal_id === "string" && body.signal_id.length > 0
      ? body.signal_id
      : null;

  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "slack")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.slack.capabilities.postReply(
    { channel, text, thread_ts },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  if (out.ok && signalId) {
    await markSignalReplied(service, signalId);
  }
  if (out.ok && thread_ts && channel) {
    // Eagerly register the thread so the next poll picks up further replies
    // even if the self-authored reply falls outside the history window.
    const { error: insertError } = await service
      .from("slack_participated_threads")
      .upsert([{ channel, thread_ts }], {
        onConflict: "channel,thread_ts",
        ignoreDuplicates: true,
      });
    if (insertError) {
      console.warn(
        `[slack-reply] could not register participated thread: ${insertError.message}`,
      );
    }
  }
  return json(out, out.ok ? 200 : 400);
}

async function handleGetSlackThread(
  url: URL,
  service: SupabaseService,
): Promise<Response> {
  const channel = url.searchParams.get("channel") ?? "";
  const thread_ts = url.searchParams.get("thread_ts") ?? "";
  if (!channel || !thread_ts) {
    return json(
      {
        ok: false,
        error: "channel and thread_ts required",
        reason: "invalid_input",
      },
      400,
    );
  }
  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token, account_id")
    .eq("provider", "slack")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row =
    (data as {
      access_token: string | null;
      account_id: string | null;
    } | null) ?? null;
  const token = row?.access_token ?? null;
  const selfUserId = row?.account_id ?? null;
  const out = await PROVIDERS.slack.capabilities.loadThread(
    { channel, thread_ts },
    { token, fetch: (i, init) => fetch(i, init) },
    selfUserId,
  );
  return json(out, out.ok ? 200 : 400);
}

async function handleDeclineCalendarEvent(
  request: Request,
  service: SupabaseService,
): Promise<Response> {
  let body: {
    event_id?: unknown;
    calendar_id?: unknown;
    signal_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const event_id = typeof body.event_id === "string" ? body.event_id : "";
  const calendar_id =
    typeof body.calendar_id === "string" && body.calendar_id.length > 0
      ? body.calendar_id
      : undefined;
  const signalId =
    typeof body.signal_id === "string" && body.signal_id.length > 0
      ? body.signal_id
      : null;

  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.google.capabilities.decline(
    { event_id, calendar_id },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  if (out.ok && signalId) {
    await dismissSignal(service, signalId);
  }
  return json(out, out.ok ? 200 : 400);
}

async function handleRescheduleCalendarEvent(
  request: Request,
  service: SupabaseService,
): Promise<Response> {
  let body: {
    event_id?: unknown;
    calendar_id?: unknown;
    shift_minutes?: unknown;
    signal_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  const event_id = typeof body.event_id === "string" ? body.event_id : "";
  const calendar_id =
    typeof body.calendar_id === "string" && body.calendar_id.length > 0
      ? body.calendar_id
      : undefined;
  const shift_minutes =
    typeof body.shift_minutes === "number" ? body.shift_minutes : Number.NaN;
  const signalId =
    typeof body.signal_id === "string" && body.signal_id.length > 0
      ? body.signal_id
      : null;

  const { data, error } = await service
    .from("provider_accounts")
    .select("access_token")
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const token =
    (data as { access_token: string | null } | null)?.access_token ?? null;

  const out = await PROVIDERS.google.capabilities.reschedule(
    { event_id, calendar_id, shift_minutes },
    { token, fetch: (i, init) => fetch(i, init) },
  );
  if (out.ok && signalId) {
    await dismissSignal(service, signalId);
  }
  return json(out, out.ok ? 200 : 400);
}

async function loadFocusDefaults(
  service: SupabaseService,
): Promise<{ status_emoji?: string }> {
  const { data, error } = await service
    .from("user_preferences")
    .select("focus_defaults")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw = (data as { focus_defaults?: unknown } | null)?.focus_defaults;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const emoji = (raw as { status_emoji?: unknown }).status_emoji;
  return typeof emoji === "string" && emoji.trim().length > 0
    ? { status_emoji: emoji.trim() }
    : {};
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

function retentionStore(service: SupabaseService): RetentionStore {
  const read = async (): Promise<RetentionView> => {
    const { data, error } = await service
      .from("user_preferences")
      .select("retention_days")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const days = (data?.retention_days as number | null) ?? 90;
    return { retention_days: days };
  };
  return {
    load: read,
    save: async (patch) => {
      const { error } = await service
        .from("user_preferences")
        .update({
          retention_days: patch.retention_days,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw new Error(error.message);
      return read();
    },
  };
}

async function loadAllRows<T>(
  service: SupabaseService,
  table: string,
): Promise<T[]> {
  const { data, error } = await service.from(table).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function loadSingleton(
  service: SupabaseService,
  table: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await service
    .from(table)
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Record<string, unknown> | null;
}

function dataPrivacyDeps(service: SupabaseService): ExportDeps {
  return {
    loadSignals: () => loadAllRows(service, "signals"),
    loadRollups: () => loadAllRows(service, "signal_rollups"),
    loadAutomations: () => loadAllRows(service, "automations"),
    loadSlackAllowlist: () => loadAllRows(service, "slack_channel_allowlist"),
    loadUserPreferences: () => loadSingleton(service, "user_preferences"),
    loadAiSettings: () => loadSingleton(service, "ai_settings"),
  };
}

function purgeDeps(service: SupabaseService): PurgeDeps {
  const purgeAll = async (table: string): Promise<number> => {
    const { error, count } = await service
      .from(table)
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  return {
    purgeSignals: () => purgeAll("signals"),
    purgeRollups: () => purgeAll("signal_rollups"),
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

function integrationsStore(service: SupabaseService): IntegrationsStore {
  return {
    loadAccounts: async () => {
      const { data, error } = await service
        .from("provider_accounts")
        .select(
          "provider, account_id, scopes, expires_at, created_at, updated_at",
        );
      if (error) throw new Error(error.message);
      return (data ?? []) as ProviderAccountRow[];
    },
    deleteAccount: async (provider) => {
      const { error } = await service
        .from("provider_accounts")
        .delete()
        .eq("provider", provider);
      if (error) throw new Error(error.message);
    },
  };
}

async function pingDatabase(
  service: SupabaseService,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await service
    .from("user_preferences")
    .select("id", { head: true, count: "exact" })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
    loadTimezone: async () => {
      const { data, error } = await service
        .from("user_preferences")
        .select("timezone")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const tz = (data as { timezone?: string | null } | null)?.timezone;
      return typeof tz === "string" && tz.length > 0 ? tz : null;
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

function draftReplyDeps(
  service: SupabaseService,
  env: WorkerEnv,
): DraftReplyDeps {
  return {
    aiStore: aiSettingsStore(service),
    usageStore: service,
    keySecret: env.AI_KEY_SECRET,
    fetch: (i, init) => fetch(i, init),
    loadSignal: async (signalId) => {
      const { data, error } = await service
        .from("signals")
        .select("*")
        .eq("id", signalId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Awaited<
        ReturnType<DraftReplyDeps["loadSignal"]>
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

async function loadAutomationsFromService(
  service: SupabaseService,
): Promise<Automation[]> {
  const { data, error } = await service
    .from("automations")
    .select(
      "id, name, enabled, priority, trigger_kind, trigger_config, predicates, actions",
    )
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    trigger_kind: Automation["trigger_kind"];
    trigger_config: Automation["trigger_config"] | null;
    predicates: Automation["predicates"] | null;
    actions: Automation["actions"] | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    trigger_kind: r.trigger_kind,
    trigger_config: r.trigger_config ?? undefined,
    predicates: r.predicates ?? [],
    actions: r.actions ?? [],
  }));
}

function automationsStore(service: SupabaseService): AutomationsStore {
  return {
    load: () => loadAutomationsFromService(service),
    save: async (automations) => {
      // Delete then insert: simplest correct semantics for "replace whole list".
      const { error: delError } = await service
        .from("automations")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (delError) throw new Error(delError.message);
      if (automations.length === 0) return [];
      const rows = automations.map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        priority: a.priority,
        trigger_kind: a.trigger_kind,
        trigger_config: a.trigger_config ?? {},
        predicates: a.predicates,
        actions: a.actions,
      }));
      const { error: insError } = await service
        .from("automations")
        .insert(rows);
      if (insError) throw new Error(insError.message);
      return loadAutomationsFromService(service);
    },
  };
}

function automationRunsStore(service: SupabaseService): AutomationRunsStore {
  return {
    insertIfNew: async (row: AutomationRunInsert) => {
      const { error } = await service.from("automation_runs").insert({
        automation_id: row.automation_id,
        trigger_event_id: row.trigger_event_id,
        signal_id: row.signal_id,
        status: row.status,
        actions_planned: row.actions_planned,
        actions_executed: row.actions_executed,
        error: row.error,
        started_at: row.started_at,
        finished_at: row.finished_at,
      });
      if (!error) return true;
      // Postgres unique-violation → duplicate dispatch; the executor
      // short-circuits to skipped_idempotent on a `false` return.
      const code = (error as { code?: string }).code;
      if (code === "23505") return false;
      throw new Error(error.message);
    },
  };
}

function automationRunsReader(
  service: SupabaseService,
): AutomationRunsReader {
  return {
    listForAutomation: async (automationId, opts) => {
      let q = service
        .from("automation_runs")
        .select(
          "id, automation_id, trigger_event_id, signal_id, status, actions_planned, actions_executed, error, started_at, finished_at",
        )
        .eq("automation_id", automationId)
        .order("started_at", { ascending: false })
        .limit(opts.limit);
      if (opts.before !== undefined) q = q.lt("started_at", opts.before);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        id: string;
        automation_id: string;
        trigger_event_id: string;
        signal_id: string | null;
        status: AutomationRunStatus;
        actions_planned: AutomationRunRow["actions_planned"] | null;
        actions_executed: ExecutedAction[] | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        automation_id: r.automation_id,
        trigger_event_id: r.trigger_event_id,
        signal_id: r.signal_id,
        status: r.status,
        actions_planned: r.actions_planned ?? [],
        actions_executed: r.actions_executed ?? [],
        error: r.error,
        started_at: r.started_at,
        finished_at: r.finished_at,
      }));
    },
    listFailures: async (limit) => {
      const { data, error } = await service
        .from("automation_runs")
        .select(
          "id, automation_id, trigger_event_id, signal_id, status, actions_planned, actions_executed, error, started_at, finished_at",
        )
        .eq("status", "failed")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        id: string;
        automation_id: string;
        trigger_event_id: string;
        signal_id: string | null;
        status: AutomationRunStatus;
        actions_planned: AutomationRunRow["actions_planned"] | null;
        actions_executed: ExecutedAction[] | null;
        error: string | null;
        started_at: string;
        finished_at: string | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        automation_id: r.automation_id,
        trigger_event_id: r.trigger_event_id,
        signal_id: r.signal_id,
        status: r.status,
        actions_planned: r.actions_planned ?? [],
        actions_executed: r.actions_executed ?? [],
        error: r.error,
        started_at: r.started_at,
        finished_at: r.finished_at,
      }));
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
    rename: async (id, label) => {
      const { data, error } = await service
        .from("web_push_subscriptions")
        .update({ device_label: label })
        .eq("id", id)
        .select("id, endpoint, device_label, last_delivered_at, created_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { device: (data ?? null) as DeviceView | null };
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
