import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "#/components/coss/checkbox";
import { SettingsPanel } from "#/components/ui/SettingsPanel";
import type { IntegrationView } from "#/features/integrations/api/integrations-api";
import { useAsyncPanel } from "#/hooks/useAsyncPanel";
import {
  DEFAULT_RETENTION_DAYS,
  type ExportPayload,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  PURGE_CONFIRMATION,
  type RetentionView,
} from "#/features/settings/data-privacy/api";
import {
  ACCENTS,
  type Accent,
  DEFAULT_THEME,
  DENSITIES,
  type Density,
  THEME_UPDATED_EVENT,
  THEMES,
  type Theme,
  type ThemeView,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

export const SETTINGS_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/settings/integrations", label: "Integrations" },
  { to: "/settings/notifications", label: "Notifications" },
  { to: "/settings/rules", label: "Inbox rules" },
  { to: "/settings/ai", label: "AI provider" },
  { to: "/settings/selfhost", label: "Self-host" },
  { to: "/settings/profile", label: "Profile" },
];

function SettingsLayout() {
  return (
    <section className="flex min-h-full">
      <aside
        aria-label="Settings"
        className="w-[220px] shrink-0 border-border border-r bg-muted/30"
      >
        <div className="px-4 pt-7 pb-4">
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.12em] uppercase">
            Settings
          </p>
          <h1 className="mt-1 font-semibold text-sidebar-foreground text-xl tracking-tight">
            Workspace
          </h1>
        </div>
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-0.5 px-2"
        >
          {SETTINGS_TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="rounded-md px-3 py-2 text-sidebar-foreground/75 text-sm hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{
                className:
                  "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1100px] space-y-6 p-8">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

export function SectionHead({
  title,
  comingInIssue,
}: {
  title: string;
  comingInIssue: number;
}) {
  return (
    <header>
      <h2 className="font-semibold text-xl">{title}</h2>
      <p className="mt-2 text-muted-foreground text-sm">
        Coming in #issue-{comingInIssue}
      </p>
    </header>
  );
}

type LoadResponse = { alert_channels: string[] };

export function NotificationsPanel({
  loader,
  saver,
  tester,
}: {
  loader?: () => Promise<LoadResponse>;
  saver?: (channels: string[]) => Promise<LoadResponse>;
  tester?: () => Promise<{
    ok?: boolean;
    error?: string;
    fired?: string[];
    errors?: Record<string, string>;
  }>;
} = {}) {
  const load = useMemo(
    () =>
      loader ?? (() => apiFetch("/api/preferences") as Promise<LoadResponse>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((channels: string[]) =>
        apiFetch("/api/preferences", {
          method: "PUT",
          body: { alert_channels: channels },
        }) as Promise<LoadResponse>),
    [saver],
  );
  const test = useMemo(
    () =>
      tester ??
      (() =>
        apiFetch("/api/notifications/test", { method: "POST" }) as Promise<{
          ok?: boolean;
          error?: string;
          fired?: string[];
          errors?: Record<string, string>;
        }>),
    [tester],
  );

  const { data, error, busy, persist } = useAsyncPanel<LoadResponse>({
    load,
    save: async (next) => {
      await save(next.alert_channels);
    },
  });

  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const toggle = useCallback(
    (channel: string) => {
      if (!data) return;
      const set = new Set(data.alert_channels);
      if (set.has(channel)) set.delete(channel);
      else set.add(channel);
      persist({ alert_channels: [...set] });
    },
    [data, persist],
  );

  const sendTest = useCallback(async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await test();
      if (result.ok) {
        const fired = result.fired ?? [];
        setStatus(
          fired.length > 0
            ? `Test notification sent via ${fired.join(", ")}`
            : "Test notification sent",
        );
      } else {
        const detail =
          result.errors && Object.keys(result.errors).length > 0
            ? Object.entries(result.errors)
                .map(([c, m]) => `${c}: ${m}`)
                .join("; ")
            : (result.error ?? "unknown error");
        setStatus(`Failed: ${detail}`);
      }
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setTesting(false);
    }
  }, [test]);

  const channels = data?.alert_channels;

  return (
    <SettingsPanel
      title="Notifications"
      desc="Where Clearday pings you when a Signal needs you."
      error={error}
      busy={busy && !data}
    >
      {channels && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              aria-label="Slack self-DM"
              checked={channels.includes("slack_dm")}
              onCheckedChange={() => toggle("slack_dm")}
              loading={busy}
            />
            <span>
              <strong className="font-medium">Slack self-DM</strong>
              <span className="ml-2 text-muted-foreground">
                Posts to your Slackbot DM via your connected Slack account.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              aria-label="Web Push"
              checked={channels.includes("web_push")}
              onCheckedChange={() => toggle("web_push")}
              loading={busy}
            />
            <span>
              <strong className="font-medium">Web Push</strong>
              <span className="ml-2 text-muted-foreground">
                Native browser notifications on devices you've registered below.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={sendTest}
            disabled={busy || testing || channels.length === 0}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            Send test notification
          </button>

          {status && (
            <output className="text-muted-foreground text-sm">{status}</output>
          )}
        </div>
      )}
    </SettingsPanel>
  );
}

type DeviceView = {
  id: string;
  endpoint: string;
  device_label: string | null;
  last_delivered_at: string | null;
  created_at: string;
};

type RegisterFn = () => Promise<DeviceView>;

export function WebPushDevicesPanel({
  loader,
  remover,
  register,
  vapidLoader,
  renamer,
}: {
  loader?: () => Promise<{ devices: DeviceView[] }>;
  remover?: (id: string) => Promise<void>;
  register?: RegisterFn;
  vapidLoader?: () => Promise<{ publicKey: string | null }>;
  renamer?: (id: string, label: string) => Promise<DeviceView>;
} = {}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const load = useMemo(
    () =>
      loader ??
      (() =>
        apiFetch("/api/push/subscriptions") as Promise<{
          devices: DeviceView[];
        }>),
    [loader],
  );
  const remove = useMemo(
    () =>
      remover ??
      (async (id: string) => {
        await apiFetch(`/api/push/subscriptions/${id}`, { method: "DELETE" });
      }),
    [remover],
  );
  const reg = useMemo(
    () => register ?? (() => registerThisDevice()),
    [register],
  );
  const rename = useMemo(
    () =>
      renamer ??
      (async (id: string, label: string) => {
        const body = (await apiFetch(`/api/push/subscriptions/${id}`, {
          method: "PATCH",
          body: { device_label: label },
        })) as { ok: boolean; device?: DeviceView; error?: string };
        if (!body.ok || !body.device)
          throw new Error(body.error ?? "rename failed");
        return body.device;
      }),
    [renamer],
  );
  const loadVapid = useMemo(
    () =>
      vapidLoader ??
      (() =>
        apiFetch("/api/push/public-key") as Promise<{
          publicKey: string | null;
        }>),
    [vapidLoader],
  );

  // register / remove / rename are bespoke action handlers (each hits its
  // own endpoint and returns a single device). useAsyncPanel drives the
  // initial device-list load; persist({ devices }) is used to fold the
  // action results back into local state without re-fetching.
  const {
    data,
    error: loadError,
    busy,
    persist,
  } = useAsyncPanel<{ devices: DeviceView[] }>({
    load,
    save: async () => {},
  });
  const devices = data?.devices ?? null;
  const error =
    actionError ?? (loadError ? loadError.message : null);

  useEffect(() => {
    let cancelled = false;
    loadVapid()
      .then((body) => {
        if (cancelled) return;
        setVapidConfigured(Boolean(body.publicKey));
      })
      .catch(() => {
        if (cancelled) return;
        setVapidConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadVapid]);

  const onRegister = useCallback(async () => {
    setActionBusy(true);
    setStatus(null);
    try {
      const device = await reg();
      const current = data?.devices ?? [];
      const next = [...current];
      const existing = next.findIndex((d) => d.id === device.id);
      if (existing >= 0) next[existing] = device;
      else next.unshift(device);
      persist({ devices: next });
      setStatus("This device is registered for push.");
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "registration failed");
    } finally {
      setActionBusy(false);
    }
  }, [data?.devices, persist, reg]);

  const onRemove = useCallback(
    async (id: string) => {
      setActionBusy(true);
      try {
        await remove(id);
        const current = data?.devices ?? [];
        persist({ devices: current.filter((d) => d.id !== id) });
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "remove failed");
      } finally {
        setActionBusy(false);
      }
    },
    [data?.devices, persist, remove],
  );

  const onRenameSubmit = useCallback(
    async (id: string) => {
      const label = draftLabel.trim();
      if (label.length === 0) {
        setActionError("device_label must not be empty");
        return;
      }
      setActionBusy(true);
      try {
        const updated = await rename(id, label);
        const current = data?.devices ?? [];
        persist({
          devices: current.map((d) => (d.id === id ? updated : d)),
        });
        setActionError(null);
        setEditingId(null);
        setDraftLabel("");
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "rename failed");
      } finally {
        setActionBusy(false);
      }
    },
    [data?.devices, draftLabel, persist, rename],
  );

  const isBusy = busy || actionBusy;

  return (
    <SettingsPanel
      title="Push devices"
      desc="Devices registered for Web Push delivery."
      error={error}
      busy={busy && !data}
    >
      {vapidConfigured === false && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          VAPID not configured — set the <code>VAPID_PUBLIC_KEY</code>,{" "}
          <code>VAPID_PRIVATE_KEY</code>, and <code>VAPID_SUBJECT</code>{" "}
          wrangler secrets to enable Web Push.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <button
          type="button"
          onClick={onRegister}
          disabled={isBusy || vapidConfigured === false}
          className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
        >
          Register this device
        </button>
        {status && (
          <output className="ml-3 text-muted-foreground text-sm">
            {status}
          </output>
        )}
      </div>

      {devices && devices.length === 0 && (
        <p className="mt-4 text-muted-foreground text-sm">
          No devices registered yet.
        </p>
      )}

      {devices && devices.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              {editingId === d.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRenameSubmit(d.id);
                  }}
                  className="flex flex-1 items-center gap-2"
                >
                  <input
                    type="text"
                    aria-label="Device label"
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    maxLength={64}
                    className="flex-1 rounded border border-border px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="text-foreground text-xs underline hover:text-foreground disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraftLabel("");
                    }}
                    disabled={isBusy}
                    className="text-muted-foreground text-xs underline hover:text-foreground disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    <strong className="font-medium">
                      {d.device_label ?? "Unknown device"}
                    </strong>
                    <span className="ml-2 text-muted-foreground">
                      {d.last_delivered_at
                        ? `Last delivered ${formatRelative(d.last_delivered_at)}`
                        : "Never delivered"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(d.id);
                        setDraftLabel(d.device_label ?? "");
                      }}
                      disabled={isBusy}
                      className="text-muted-foreground text-xs underline hover:text-foreground disabled:opacity-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(d.id)}
                      disabled={isBusy}
                      className="text-muted-foreground text-xs underline hover:text-foreground disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsPanel>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPwaPanel() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onInstall = useCallback(async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        setStatus("Install accepted.");
      } else {
        setStatus("Install dismissed.");
      }
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }, [prompt]);

  // No async load lifecycle — the panel reacts to browser-native install
  // events, so useAsyncPanel is intentionally not used here. Only the chrome
  // migrates to <SettingsPanel>.
  if (installed) {
    return (
      <SettingsPanel
        title="Install Clearday"
        desc="Clearday is installed."
      />
    );
  }

  if (!prompt && !status) return null;

  return (
    <SettingsPanel
      title="Install Clearday"
      desc="Add Clearday to your dock or home screen for an app-like experience."
    >
      <div className="mt-4 flex items-center gap-3">
        {prompt && (
          <button
            type="button"
            onClick={onInstall}
            disabled={busy}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            Install Clearday
          </button>
        )}
        {status && (
          <output className="text-muted-foreground text-sm">{status}</output>
        )}
      </div>
    </SettingsPanel>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

async function registerThisDevice(): Promise<DeviceView> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("notifications are not supported in this browser");
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Web Push is not supported in this browser");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`notifications permission ${permission}`);
  }
  const keyResp = (await apiFetch("/api/push/public-key")) as {
    publicKey: string | null;
  };
  if (!keyResp.publicKey) {
    throw new Error("server has no VAPID public key configured");
  }
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      keyResp.publicKey,
    ) as BufferSource,
  });
  const json = subscription.toJSON();
  const out = (await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent,
    },
  })) as { ok: boolean; device: DeviceView };
  return out.device;
}

function urlBase64ToUint8Array(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type AiProvider = "anthropic" | "openai" | "gemini" | "groq" | "ollama";

type AiSettingsView = {
  provider: AiProvider | null;
  default_model: string | null;
  base_url: string | null;
  has_api_key: boolean;
  last_validated_at: string | null;
  // Budget meter + privacy redactor fields. Optional so older fixtures
  // (and the initial pre-load empty state) can omit them; the UI falls
  // back to sensible defaults below.
  monthly_budget_usd?: number;
  fallback_model?: string | null;
  privacy_mode?: boolean;
  redact_patterns?: string[];
  ai_disabled?: boolean;
  month_spent_usd?: number;
};

type AiPutBody = {
  provider: AiProvider;
  default_model?: string;
  base_url?: string;
  api_key?: string;
  monthly_budget_usd?: number;
  fallback_model?: string | null;
  privacy_mode?: boolean;
  redact_patterns?: string[];
  ai_disabled?: boolean;
};

const AI_PROVIDERS: Array<{
  id: AiProvider;
  label: string;
  needsKey: boolean;
}> = [
  { id: "anthropic", label: "Anthropic", needsKey: true },
  { id: "openai", label: "OpenAI", needsKey: true },
  { id: "gemini", label: "Google Gemini", needsKey: true },
  { id: "groq", label: "Groq", needsKey: true },
  { id: "ollama", label: "Ollama (local)", needsKey: false },
];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  groq: "llama-3.1-70b-versatile",
  ollama: "llama3",
};

export function AiProviderPanel({
  loader,
  saver,
  tester,
}: {
  loader?: () => Promise<AiSettingsView>;
  saver?: (body: AiPutBody) => Promise<AiSettingsView>;
  tester?: () => Promise<{ ok?: boolean; model?: string; error?: string }>;
} = {}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");

  const load = useMemo(
    () =>
      loader ?? (() => apiFetch("/api/ai/settings") as Promise<AiSettingsView>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((body: AiPutBody) =>
        apiFetch("/api/ai/settings", {
          method: "PUT",
          body,
        }) as Promise<AiSettingsView>),
    [saver],
  );
  const test = useMemo(
    () =>
      tester ??
      (() =>
        apiFetch("/api/ai/test", { method: "POST" }) as Promise<{
          ok?: boolean;
          model?: string;
          error?: string;
        }>),
    [tester],
  );

  // selectProvider / saveDraft / runTest are bespoke action handlers (each
  // composes a different AiPutBody body or hits a different endpoint), so
  // useAsyncPanel drives only the load lifecycle. Successful actions feed
  // their server response back through persist({...next}) so the local view
  // mirrors the server without an extra GET.
  const {
    data: view,
    error: loadError,
    busy,
    persist,
  } = useAsyncPanel<AiSettingsView>({
    load,
    save: async () => {},
  });
  const error =
    actionError ?? (loadError ? loadError.message : null);

  // Sync drafts from the persisted snapshot when a fresh one lands.
  const lastViewRef = useRef<AiSettingsView | null>(null);
  useEffect(() => {
    if (view && view !== lastViewRef.current) {
      setDraftModel(view.default_model ?? "");
      setDraftBaseUrl(view.base_url ?? "");
      lastViewRef.current = view;
    }
  }, [view]);

  const selectProvider = useCallback(
    async (provider: AiProvider) => {
      setActionBusy(true);
      try {
        const next = await save({
          provider,
          default_model: draftModel || DEFAULT_MODELS[provider],
          base_url: draftBaseUrl || undefined,
        });
        persist({ ...next });
        setDraftModel(next.default_model ?? DEFAULT_MODELS[provider]);
        setActionError(null);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "save failed");
      } finally {
        setActionBusy(false);
      }
    },
    [draftBaseUrl, draftModel, persist, save],
  );

  const saveDraft = useCallback(async () => {
    if (!view?.provider) return;
    setActionBusy(true);
    try {
      const next = await save({
        provider: view.provider,
        default_model: draftModel || undefined,
        base_url: draftBaseUrl || undefined,
        api_key: draftKey || undefined,
      });
      persist({ ...next });
      setDraftKey("");
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "save failed");
    } finally {
      setActionBusy(false);
    }
  }, [draftBaseUrl, draftKey, draftModel, persist, save, view?.provider]);

  const runTest = useCallback(async () => {
    setActionBusy(true);
    setTestStatus(null);
    try {
      const result = await test();
      if (result.ok) setTestStatus(`Connected (${result.model ?? "ok"})`);
      else setTestStatus(`Failed: ${result.error ?? "unknown error"}`);
      // Reload so last_validated_at refreshes.
      const fresh = await load();
      persist({ ...fresh });
    } catch (e) {
      setTestStatus(
        `Failed: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setActionBusy(false);
    }
  }, [load, persist, test]);

  const activeProvider = view?.provider ?? null;
  const needsKey = activeProvider
    ? (AI_PROVIDERS.find((p) => p.id === activeProvider)?.needsKey ?? true)
    : true;
  const isBusy = busy || actionBusy;

  return (
    <SettingsPanel
      title="AI provider"
      desc="Bring your own LLM API key. Clearday never operates a shared model."
      error={error}
      busy={busy && !view}
    >
      {view && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {AI_PROVIDERS.map((p) => {
              const active = view.provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectProvider(p.id)}
                  disabled={isBusy}
                  className={`rounded border px-3 py-2 text-left text-sm ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="block font-medium">{p.label}</span>
                  <span
                    className={`block text-xs ${active ? "text-zinc-200" : "text-zinc-500"}`}
                  >
                    {active ? "Active" : "Select"}
                  </span>
                </button>
              );
            })}
          </div>

          <label className="block text-sm">
            <span className="block font-medium text-zinc-900">
              Default model
            </span>
            <input
              type="text"
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder={
                activeProvider ? DEFAULT_MODELS[activeProvider] : "model id"
              }
              className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              disabled={isBusy || !activeProvider}
            />
          </label>

          {activeProvider === "ollama" && (
            <label className="block text-sm">
              <span className="block font-medium text-foreground">
                Base URL
              </span>
              <input
                type="text"
                value={draftBaseUrl}
                onChange={(e) => setDraftBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                disabled={isBusy}
              />
            </label>
          )}

          {needsKey && (
            <label className="block text-sm">
              <span className="block font-medium text-foreground">API key</span>
              <input
                type="password"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={
                  view.has_api_key ? "•••••• (already set)" : "Paste your key"
                }
                className="mt-1 w-full rounded border border-border px-2 py-1.5 font-mono text-sm"
                disabled={isBusy}
                autoComplete="off"
              />
              <span className="mt-1 block text-muted-foreground text-xs">
                Stored encrypted. Never returned to the browser in plaintext.
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveDraft}
              disabled={isBusy || !activeProvider}
              className="rounded border border-foreground bg-foreground px-3 py-1.5 text-background text-sm hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={
                isBusy ||
                !activeProvider ||
                (needsKey && !view.has_api_key && !draftKey)
              }
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              Test connection
            </button>
            {view.last_validated_at && (
              <span className="text-muted-foreground text-xs">
                Last validated{" "}
                {new Date(view.last_validated_at).toLocaleString()}
              </span>
            )}
          </div>

          {testStatus && (
            <output className="block text-muted-foreground text-sm">
              {testStatus}
            </output>
          )}
        </div>
      )}
    </SettingsPanel>
  );
}

export function AiSafeguardsPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<AiSettingsView>;
  saver?: (body: AiPutBody) => Promise<AiSettingsView>;
} = {}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftBudget, setDraftBudget] = useState("");
  const [draftFallback, setDraftFallback] = useState("");
  const [draftPatterns, setDraftPatterns] = useState("");

  const load = useMemo(
    () =>
      loader ?? (() => apiFetch("/api/ai/settings") as Promise<AiSettingsView>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((body: AiPutBody) =>
        apiFetch("/api/ai/settings", {
          method: "PUT",
          body,
        }) as Promise<AiSettingsView>),
    [saver],
  );

  // The patches on this panel (privacy toggle, ai_disabled toggle, budget +
  // fallback, redact_patterns) project 1:1 onto the AiSettingsView, so
  // useAsyncPanel.persist drives the save lifecycle. The save callback
  // bridges the merged view onto an AiPutBody for the API.
  const {
    data: view,
    error: panelError,
    busy,
    persist,
  } = useAsyncPanel<AiSettingsView>({
    load,
    save: async (next) => {
      if (!next.provider) return;
      await save({
        provider: next.provider,
        monthly_budget_usd: next.monthly_budget_usd,
        fallback_model: next.fallback_model,
        privacy_mode: next.privacy_mode,
        redact_patterns: next.redact_patterns,
        ai_disabled: next.ai_disabled,
      });
    },
  });
  const error = errorMsg ?? (panelError ? panelError.message : null);

  // Sync drafts from the persisted snapshot when a fresh one lands.
  const lastViewRef = useRef<AiSettingsView | null>(null);
  useEffect(() => {
    if (view && view !== lastViewRef.current) {
      setDraftBudget(String(view.monthly_budget_usd ?? 25));
      setDraftFallback(view.fallback_model ?? "");
      setDraftPatterns((view.redact_patterns ?? []).join("\n"));
      lastViewRef.current = view;
    }
  }, [view]);

  const saveBudget = useCallback(() => {
    const n = Number(draftBudget);
    if (!Number.isFinite(n) || n < 0) {
      setErrorMsg("Budget must be a non-negative number.");
      return;
    }
    setErrorMsg(null);
    persist({
      monthly_budget_usd: n,
      fallback_model: draftFallback || null,
    });
  }, [draftBudget, draftFallback, persist]);

  const savePatterns = useCallback(() => {
    const patterns = draftPatterns
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setErrorMsg(null);
    persist({ redact_patterns: patterns });
  }, [draftPatterns, persist]);

  const togglePrivacy = useCallback(() => {
    if (!view) return;
    setErrorMsg(null);
    persist({ privacy_mode: !view.privacy_mode });
  }, [persist, view]);

  const toggleDisabled = useCallback(() => {
    if (!view) return;
    setErrorMsg(null);
    persist({ ai_disabled: !view.ai_disabled });
  }, [persist, view]);

  const budget = view?.monthly_budget_usd ?? 25;
  const spent = view?.month_spent_usd ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const overFallback = ratio >= 0.8;
  const overBudget = ratio >= 1;
  const pctClass = overBudget
    ? "bg-destructive"
    : overFallback
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <SettingsPanel
      title="AI safeguards"
      desc="Caps cost and keeps sensitive content out of the model provider."
      error={error}
      busy={busy && !view}
    >
      {view && (
        <div className="mt-4 space-y-6">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-foreground text-sm">
                Monthly spend
              </span>
              <span className="text-foreground text-sm">
                ${spent.toFixed(2)} of ${budget.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className={`h-full ${pctClass}`}
                style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
              />
            </div>
            {overBudget && (
              <p className="mt-2 text-destructive text-sm">
                AI disabled — monthly budget reached.
              </p>
            )}
            {overFallback && !overBudget && (
              <p className="mt-2 text-amber-700 text-sm">
                Running on fallback model (≥80% of budget spent).
              </p>
            )}
          </div>

          <label className="block text-sm">
            <span className="block font-medium text-foreground">
              Monthly budget (USD)
            </span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={draftBudget}
              onChange={(e) => setDraftBudget(e.target.value)}
              className="mt-1 w-40 rounded border border-border px-2 py-1.5 text-sm"
              disabled={busy}
            />
          </label>

          <label className="block text-sm">
            <span className="block font-medium text-foreground">
              Fallback model
            </span>
            <input
              type="text"
              value={draftFallback}
              onChange={(e) => setDraftFallback(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
              className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
              disabled={busy}
            />
            <span className="mt-1 block text-muted-foreground text-xs">
              Used in place of your default model once 80% of the budget has
              been spent.
            </span>
          </label>

          <button
            type="button"
            onClick={saveBudget}
            disabled={busy || !view.provider}
            className="rounded border border-foreground bg-foreground px-3 py-1.5 text-background text-sm hover:opacity-90 disabled:opacity-50"
          >
            Save budget
          </button>

          <div className="flex items-center gap-3 border-border border-t pt-4 text-sm">
            <Checkbox
              aria-label="Redact sensitive content"
              checked={!!view.privacy_mode}
              onCheckedChange={togglePrivacy}
              loading={busy}
            />
            <span>
              <strong className="font-medium">Redact sensitive content</strong>
              <span className="ml-2 text-muted-foreground">
                Strips code blocks, secrets, paths, and PR diffs from prompts
                before they leave the Worker.
              </span>
            </span>
          </div>

          <label className="block text-sm">
            <span className="block font-medium text-foreground">
              Custom redaction patterns
            </span>
            <textarea
              value={draftPatterns}
              onChange={(e) => setDraftPatterns(e.target.value)}
              placeholder="One regex per line"
              rows={3}
              className="mt-1 w-full rounded border border-border px-2 py-1.5 font-mono text-xs"
              disabled={busy}
            />
            <button
              type="button"
              onClick={savePatterns}
              disabled={busy || !view.provider}
              className="mt-2 rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              Save patterns
            </button>
          </label>

          <div className="flex items-center gap-3 border-border border-t pt-4 text-sm">
            <Checkbox
              aria-label="Disable AI on this account"
              checked={!!view.ai_disabled}
              onCheckedChange={toggleDisabled}
              loading={busy}
            />
            <span>
              <strong className="font-medium">
                Disable AI on this account
              </strong>
              <span className="ml-2 text-muted-foreground">
                Skips every AI call regardless of budget or provider config.
              </span>
            </span>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}

// ---------------------------------------------------------------------------
// Quiet hours, per-event matrix, and auto focus-block panels (issue #9). All
// three read/write the same /api/preferences endpoint; each owns its slice
// of the body so saves don't clobber each other.
// ---------------------------------------------------------------------------

const SIGNAL_KINDS_FOR_MATRIX: Array<{ id: string; label: string }> = [
  { id: "meeting", label: "Meetings" },
  { id: "mention", label: "Slack mentions" },
  { id: "dm", label: "Direct messages" },
  { id: "thread_reply", label: "Thread replies" },
  { id: "pr_review_requested", label: "PR review requested" },
  { id: "pr_authored", label: "Authored PRs" },
  { id: "pr_assigned", label: "Assigned PRs" },
];

const MATRIX_CHANNELS: Array<{ id: string; label: string }> = [
  { id: "slack_dm", label: "Slack" },
  { id: "web_push", label: "Push" },
  { id: "email", label: "Email" },
  { id: "desktop", label: "Desktop" },
];

type PreferencesView = {
  alert_channels: string[];
  notification_matrix: Record<string, string[]>;
  quiet_hours_v2: Record<string, unknown>;
  focus_block: Record<string, unknown>;
  focus_defaults: Record<string, unknown>;
};

type PreferencesPatch = {
  notification_matrix?: Record<string, string[]>;
  quiet_hours_v2?: Record<string, unknown>;
  focus_block?: Record<string, unknown>;
  focus_defaults?: Record<string, unknown>;
};

function defaultPrefsLoader(): Promise<PreferencesView> {
  return apiFetch("/api/preferences") as Promise<PreferencesView>;
}

function defaultPrefsSaver(patch: PreferencesPatch): Promise<PreferencesView> {
  return apiFetch("/api/preferences", {
    method: "PUT",
    body: patch,
  }) as Promise<PreferencesView>;
}

export function NotificationMatrixPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<PreferencesView>;
  saver?: (patch: PreferencesPatch) => Promise<PreferencesView>;
} = {}) {
  const [matrix, setMatrix] = useState<Record<string, string[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(() => loader ?? defaultPrefsLoader, [loader]);
  const save = useMemo(() => saver ?? defaultPrefsSaver, [saver]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((view) => {
        if (cancelled) return;
        setMatrix(view.notification_matrix ?? {});
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const toggle = useCallback(
    async (kind: string, channel: string) => {
      if (!matrix) return;
      const cur = matrix[kind] ?? [];
      const next = cur.includes(channel)
        ? cur.filter((c) => c !== channel)
        : [...cur, channel];
      const nextMatrix = { ...matrix, [kind]: next };
      setMatrix(nextMatrix);
      setBusy(true);
      try {
        const view = await save({ notification_matrix: nextMatrix });
        setMatrix(view.notification_matrix ?? nextMatrix);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [matrix, save],
  );

  return (
    <section
      aria-label="Per-event channel matrix"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">
        Per-event channels
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Pick which channels fire for each kind of Signal.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {matrix == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {matrix && (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="pb-2 font-medium">Kind</th>
              {MATRIX_CHANNELS.map((c) => (
                <th key={c.id} className="pb-2 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIGNAL_KINDS_FOR_MATRIX.map((kind) => (
              <tr key={kind.id} className="border-t border-zinc-100">
                <td className="py-2 text-zinc-700">{kind.label}</td>
                {MATRIX_CHANNELS.map((channel) => {
                  const checked = (matrix[kind.id] ?? []).includes(channel.id);
                  const ariaLabel = `${kind.label} via ${channel.label}`;
                  return (
                    <td key={channel.id} className="py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={ariaLabel}
                        checked={checked}
                        onChange={() => toggle(kind.id, channel.id)}
                        disabled={busy}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const DAYS_OF_WEEK: Array<{ id: number; label: string }> = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

type QuietHoursState = {
  enabled: boolean;
  days: number[];
  start: string;
  end: string;
  utc_offset_minutes: number;
  allow_through: Array<{ kind?: string; threshold?: string; tag?: string }>;
};

function defaultQuietHoursState(raw: Record<string, unknown>): QuietHoursState {
  const days = Array.isArray(raw.days)
    ? raw.days.filter(
        (d): d is number => typeof d === "number" && d >= 0 && d <= 6,
      )
    : [1, 2, 3, 4, 5];
  return {
    enabled: raw.enabled === true,
    days,
    start: typeof raw.start === "string" ? raw.start : "22:00",
    end: typeof raw.end === "string" ? raw.end : "08:00",
    utc_offset_minutes:
      typeof raw.utc_offset_minutes === "number" ? raw.utc_offset_minutes : 0,
    allow_through: Array.isArray(raw.allow_through)
      ? (raw.allow_through.filter(
          (r) => r && typeof r === "object",
        ) as QuietHoursState["allow_through"])
      : [{ kind: "mention" }, { kind: "dm" }],
  };
}

export function QuietHoursPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<PreferencesView>;
  saver?: (patch: PreferencesPatch) => Promise<PreferencesView>;
} = {}) {
  const [state, setState] = useState<QuietHoursState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(() => loader ?? defaultPrefsLoader, [loader]);
  const save = useMemo(() => saver ?? defaultPrefsSaver, [saver]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((view) => {
        if (cancelled) return;
        setState(defaultQuietHoursState(view.quiet_hours_v2 ?? {}));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const persist = useCallback(
    async (next: QuietHoursState) => {
      setState(next);
      setBusy(true);
      try {
        await save({
          quiet_hours_v2: next as unknown as Record<string, unknown>,
        });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [save],
  );

  return (
    <section
      aria-label="Quiet hours"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Quiet hours</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Hold non-urgent alerts until the window ends. Allow-through kinds
        deliver immediately.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {state == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {state && (
        <div className="mt-4 space-y-4 text-sm">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={() => persist({ ...state, enabled: !state.enabled })}
              disabled={busy}
            />
            <span>Enable quiet hours</span>
          </label>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-zinc-500">Start</span>
              <input
                type="time"
                aria-label="Quiet hours start"
                value={state.start}
                onChange={(e) => setState({ ...state, start: e.target.value })}
                onBlur={() => persist(state)}
                disabled={busy || !state.enabled}
                className="rounded border border-zinc-200 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-zinc-500">End</span>
              <input
                type="time"
                aria-label="Quiet hours end"
                value={state.end}
                onChange={(e) => setState({ ...state, end: e.target.value })}
                onBlur={() => persist(state)}
                disabled={busy || !state.enabled}
                className="rounded border border-zinc-200 px-2 py-1"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-zinc-500">Days</p>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((d) => {
                const on = state.days.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Quiet on ${d.label}`}
                    onClick={() => {
                      const days = on
                        ? state.days.filter((x) => x !== d.id)
                        : [...state.days, d.id].sort();
                      persist({ ...state, days });
                    }}
                    disabled={busy || !state.enabled}
                    className={`rounded border px-2 py-1 ${
                      on
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type FocusBlockState = {
  enabled: boolean;
  allow_mentions: boolean;
  allow_imminent_meeting_minutes: number;
};

function defaultFocusState(raw: Record<string, unknown>): FocusBlockState {
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    allow_mentions:
      typeof raw.allow_mentions === "boolean" ? raw.allow_mentions : true,
    allow_imminent_meeting_minutes:
      typeof raw.allow_imminent_meeting_minutes === "number"
        ? raw.allow_imminent_meeting_minutes
        : 5,
  };
}

export function FocusBlockPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<PreferencesView>;
  saver?: (patch: PreferencesPatch) => Promise<PreferencesView>;
} = {}) {
  const [state, setState] = useState<FocusBlockState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(() => loader ?? defaultPrefsLoader, [loader]);
  const save = useMemo(() => saver ?? defaultPrefsSaver, [saver]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((view) => {
        if (cancelled) return;
        setState(defaultFocusState(view.focus_block ?? {}));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const persist = useCallback(
    async (next: FocusBlockState) => {
      setState(next);
      setBusy(true);
      try {
        await save({ focus_block: next as unknown as Record<string, unknown> });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [save],
  );

  return (
    <section
      aria-label="Focus block auto-suppression"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">
        Auto focus-block
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        While a calendar Focus event is active, silence everything except what
        you allow.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {state == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {state && (
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={() => persist({ ...state, enabled: !state.enabled })}
              disabled={busy}
            />
            <span>Auto-suppress alerts during focus blocks</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={state.allow_mentions}
              onChange={() =>
                persist({ ...state, allow_mentions: !state.allow_mentions })
              }
              disabled={busy || !state.enabled}
            />
            <span>Let mentions and DMs through</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-zinc-500">Imminent meeting window</span>
            <input
              type="number"
              min={0}
              max={60}
              aria-label="Imminent meeting minutes"
              value={state.allow_imminent_meeting_minutes}
              onChange={(e) =>
                setState({
                  ...state,
                  allow_imminent_meeting_minutes: Number(e.target.value) || 0,
                })
              }
              onBlur={() => persist(state)}
              disabled={busy || !state.enabled}
              className="w-20 rounded border border-zinc-200 px-2 py-1"
            />
            <span className="text-zinc-500">min</span>
          </label>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Focus session defaults (issue #10). Stored on `user_preferences.focus_defaults`
// and threaded into `startFocusSession` via the worker's `/api/focus` route. v1
// covers the Slack status emoji; other knobs (default duration, default message)
// can layer onto the same row when they're needed.
// ---------------------------------------------------------------------------

const DEFAULT_FOCUS_STATUS_EMOJI = ":no_bell:";

function readFocusEmoji(raw: Record<string, unknown>): string {
  const v = raw.status_emoji;
  return typeof v === "string" ? v : DEFAULT_FOCUS_STATUS_EMOJI;
}

export function FocusDefaultsPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<PreferencesView>;
  saver?: (patch: PreferencesPatch) => Promise<PreferencesView>;
} = {}) {
  const [emoji, setEmoji] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(() => loader ?? defaultPrefsLoader, [loader]);
  const save = useMemo(() => saver ?? defaultPrefsSaver, [saver]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((view) => {
        if (cancelled) return;
        setEmoji(readFocusEmoji(view.focus_defaults ?? {}));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const persist = useCallback(async () => {
    if (emoji == null) return;
    const trimmed = emoji.trim() || DEFAULT_FOCUS_STATUS_EMOJI;
    setBusy(true);
    try {
      await save({ focus_defaults: { status_emoji: trimmed } });
      setEmoji(trimmed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [emoji, save]);

  return (
    <section
      aria-label="Focus session defaults"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Focus defaults</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Slack status emoji applied while a focus session is active. Use any
        Slack-supported shortcode (e.g. <code>:no_bell:</code>,{" "}
        <code>:headphones:</code>).
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {emoji == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {emoji != null && (
        <label className="mt-4 flex items-center gap-3 text-sm">
          <span className="text-zinc-500">Slack status emoji</span>
          <input
            type="text"
            aria-label="Slack status emoji"
            value={emoji}
            placeholder={DEFAULT_FOCUS_STATUS_EMOJI}
            onChange={(e) => setEmoji(e.target.value)}
            onBlur={() => persist()}
            disabled={busy}
            className="w-40 rounded border border-zinc-200 px-2 py-1 font-mono"
          />
        </label>
      )}
    </section>
  );
}

type EmailTransport = "resend" | "postmark";

type EmailDigestSettingsView = {
  enabled: boolean;
  transport: EmailTransport;
  has_api_key: boolean;
  from_email: string | null;
  to_email: string | null;
  hour_utc: number;
  last_sent_date: string | null;
};

type EmailDigestPutBody = {
  enabled?: boolean;
  transport?: EmailTransport;
  api_key?: string;
  from_email?: string | null;
  to_email?: string | null;
  hour_utc?: number;
};

export function EmailDigestPanel({
  loader,
  saver,
  tester,
}: {
  loader?: () => Promise<EmailDigestSettingsView>;
  saver?: (
    body: EmailDigestPutBody,
  ) => Promise<
    | { ok: true; settings: EmailDigestSettingsView }
    | { ok: false; error: string }
  >;
  tester?: () => Promise<{ ok: boolean; error?: string }>;
} = {}) {
  const [view, setView] = useState<EmailDigestSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    api_key: string;
    from_email: string;
    to_email: string;
    hour_utc: number;
    transport: EmailTransport;
  }>({
    api_key: "",
    from_email: "",
    to_email: "",
    hour_utc: 13,
    transport: "resend",
  });

  const load = useMemo(
    () =>
      loader ??
      (() => apiFetch("/api/email-digest") as Promise<EmailDigestSettingsView>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((body: EmailDigestPutBody) =>
        apiFetch("/api/email-digest", {
          method: "PUT",
          body,
        }) as Promise<
          | { ok: true; settings: EmailDigestSettingsView }
          | { ok: false; error: string }
        >),
    [saver],
  );
  const test = useMemo(
    () =>
      tester ??
      (() =>
        apiFetch("/api/email-digest/test", {
          method: "POST",
        }) as Promise<{ ok: boolean; error?: string }>),
    [tester],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDraft((d) => ({
          ...d,
          from_email: v.from_email ?? "",
          to_email: v.to_email ?? "",
          hour_utc: v.hour_utc,
          transport: v.transport,
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onSave = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const body: EmailDigestPutBody = {
        from_email: draft.from_email.trim() || null,
        to_email: draft.to_email.trim() || null,
        hour_utc: draft.hour_utc,
        transport: draft.transport,
      };
      if (draft.api_key.trim().length > 0) body.api_key = draft.api_key.trim();
      const out = await save(body);
      if (out.ok) {
        setView(out.settings);
        setDraft((d) => ({ ...d, api_key: "" }));
        setStatus("Saved.");
      } else {
        setError(out.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [draft, save]);

  const onToggleEnabled = useCallback(async () => {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      const out = await save({ enabled: !view.enabled });
      if (out.ok) setView(out.settings);
      else setError(out.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [save, view]);

  const onTest = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const out = await test();
      setStatus(out.ok ? "Test email sent." : null);
      if (!out.ok) setError(out.error ?? "test failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "test failed");
    } finally {
      setBusy(false);
    }
  }, [test]);

  return (
    <section
      aria-label="Email digest"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Email digest</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Daily morning email summarizing new Signals. Bring your own Resend or
        Postmark API key — Clearday never operates a shared mailer.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {view == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {view && (
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={view.enabled}
              onChange={onToggleEnabled}
              disabled={busy}
            />
            <span>
              <strong className="font-medium">Daily digest</strong>
              <span className="ml-2 text-zinc-500">
                {view.enabled
                  ? `Sends each day at ${view.hour_utc}:00 UTC`
                  : "Disabled"}
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="email-digest-transport"
              className="block text-xs uppercase tracking-wide text-zinc-500"
            >
              Transport
            </label>
            <select
              id="email-digest-transport"
              value={draft.transport}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  transport: e.target.value as EmailTransport,
                }))
              }
              disabled={busy}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
            >
              <option value="resend">Resend</option>
              <option value="postmark">Postmark</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="email-digest-from"
              className="block text-xs uppercase tracking-wide text-zinc-500"
            >
              From address
            </label>
            <input
              id="email-digest-from"
              type="text"
              placeholder="Clearday <noreply@yourdomain.com>"
              value={draft.from_email}
              onChange={(e) =>
                setDraft((d) => ({ ...d, from_email: e.target.value }))
              }
              disabled={busy}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
            />
          </div>

          <div>
            <label
              htmlFor="email-digest-to"
              className="block text-xs uppercase tracking-wide text-zinc-500"
            >
              To address
            </label>
            <input
              id="email-digest-to"
              type="email"
              placeholder="you@example.com"
              value={draft.to_email}
              onChange={(e) =>
                setDraft((d) => ({ ...d, to_email: e.target.value }))
              }
              disabled={busy}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
            />
          </div>

          <div>
            <label
              htmlFor="email-digest-hour"
              className="block text-xs uppercase tracking-wide text-zinc-500"
            >
              Send hour (UTC)
            </label>
            <input
              id="email-digest-hour"
              type="number"
              min={0}
              max={23}
              value={draft.hour_utc}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  hour_utc: Math.max(
                    0,
                    Math.min(23, Number(e.target.value) || 0),
                  ),
                }))
              }
              disabled={busy}
              className="mt-1 w-24 rounded border border-zinc-200 px-2 py-1"
            />
          </div>

          <div>
            <label
              htmlFor="email-digest-key"
              className="block text-xs uppercase tracking-wide text-zinc-500"
            >
              {draft.transport === "postmark" ? "Postmark" : "Resend"} API key
            </label>
            <input
              id="email-digest-key"
              type="password"
              placeholder={
                view.has_api_key
                  ? "•••••• (already set)"
                  : draft.transport === "postmark"
                    ? "Postmark server token"
                    : "re_..."
              }
              value={draft.api_key}
              onChange={(e) =>
                setDraft((d) => ({ ...d, api_key: e.target.value }))
              }
              disabled={busy}
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Stored encrypted at rest; the key is only sent to{" "}
              {draft.transport === "postmark" ? "Postmark" : "Resend"}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onTest}
              disabled={busy || !view.has_api_key}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Send test email
            </button>
            {status && (
              <output className="text-sm text-zinc-600">{status}</output>
            )}
          </div>

          {view.last_sent_date && (
            <p className="text-xs text-zinc-500">
              Last digest sent on {view.last_sent_date}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type ThemeSaveResult =
  | { ok: true; theme: ThemeView }
  | { ok: false; error: string };

const ACCENT_LABELS: Record<Accent, string> = {
  rausch: "Rausch",
  ocean: "Ocean",
  forest: "Forest",
  plum: "Plum",
};

const ACCENT_SWATCHES: Record<Accent, string> = {
  rausch: "#ff385c",
  ocean: "#0066ff",
  forest: "#10b981",
  plum: "#92174d",
};

export function ThemePanel({
  loader,
  saver,
}: {
  loader?: () => Promise<ThemeView>;
  saver?: (patch: ThemeView) => Promise<ThemeSaveResult>;
} = {}) {
  const [view, setView] = useState<ThemeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () => loader ?? (() => apiFetch("/api/theme") as Promise<ThemeView>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((patch: ThemeView) =>
        apiFetch("/api/theme", {
          method: "PUT",
          body: patch,
        }) as Promise<ThemeSaveResult>),
    [saver],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((t) => {
        if (!cancelled) setView(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const update = async (patch: Partial<ThemeView>) => {
    if (!view) return;
    const next: ThemeView = { ...view, ...patch };
    setView(next);
    setStatus(null);
    setError(null);
    setBusy(true);
    try {
      const out = await save(next);
      if (!out.ok) {
        setError(out.error);
        return;
      }
      setView(out.theme);
      setStatus("Saved.");
      window.dispatchEvent(
        new CustomEvent(THEME_UPDATED_EVENT, { detail: out.theme }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const current = view ?? DEFAULT_THEME;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Theme & layout</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Light / dark / system, density, and accent color. Changes apply
        immediately without a reload.
      </p>
      {view === null ? (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="mt-3 grid gap-4">
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">Theme</legend>
            <div className="mt-2 flex gap-2">
              {THEMES.map((t: Theme) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded border px-3 py-1.5 text-sm capitalize ${
                    current.theme === t
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    className="sr-only"
                    checked={current.theme === t}
                    onChange={() => update({ theme: t })}
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">
              Density
            </legend>
            <div className="mt-2 flex gap-2">
              {DENSITIES.map((d: Density) => (
                <label
                  key={d}
                  className={`cursor-pointer rounded border px-3 py-1.5 text-sm capitalize ${
                    current.density === d
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="density"
                    className="sr-only"
                    checked={current.density === d}
                    onChange={() => update({ density: d })}
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">
              Accent color
            </legend>
            <div className="mt-2 flex gap-2">
              {ACCENTS.map((a: Accent) => (
                <label
                  key={a}
                  aria-label={ACCENT_LABELS[a]}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                    current.accent === a
                      ? "border-zinc-900"
                      : "border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="accent"
                    className="sr-only"
                    checked={current.accent === a}
                    onChange={() => update({ accent: a })}
                  />
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 rounded-full"
                    style={{ backgroundColor: ACCENT_SWATCHES[a] }}
                  />
                  {ACCENT_LABELS[a]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3" aria-busy={busy}>
            {status && (
              <output className="text-sm text-emerald-700">{status}</output>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type RetentionSaveResult =
  | { ok: true; retention: RetentionView }
  | { ok: false; error: string };

type PurgeResult =
  | { ok: true; deleted: { signals: number; signal_rollups: number } }
  | { ok: false; error: string };

export function DataPrivacyPanel({
  exporter,
  purger,
  retentionLoader,
  retentionSaver,
}: {
  exporter?: () => Promise<ExportPayload>;
  purger?: (confirmation: string) => Promise<PurgeResult>;
  retentionLoader?: () => Promise<RetentionView>;
  retentionSaver?: (patch: RetentionView) => Promise<RetentionSaveResult>;
} = {}) {
  const [retention, setRetention] = useState<RetentionView | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeStatus, setPurgeStatus] = useState<string | null>(null);

  const loadRetention = useMemo(
    () =>
      retentionLoader ??
      (() => apiFetch("/api/retention") as Promise<RetentionView>),
    [retentionLoader],
  );
  const saveRetention = useMemo(
    () =>
      retentionSaver ??
      ((patch: RetentionView) =>
        apiFetch("/api/retention", {
          method: "PUT",
          body: patch,
        }) as Promise<RetentionSaveResult>),
    [retentionSaver],
  );
  const runExport = useMemo(
    () =>
      exporter ??
      (() => apiFetch("/api/data/export") as Promise<ExportPayload>),
    [exporter],
  );
  const runPurge = useMemo(
    () =>
      purger ??
      ((confirmation: string) =>
        apiFetch("/api/data/purge", {
          method: "POST",
          body: { confirmation },
        }) as Promise<PurgeResult>),
    [purger],
  );

  useEffect(() => {
    let cancelled = false;
    loadRetention()
      .then((r) => {
        if (!cancelled) setRetention(r);
      })
      .catch((e) => {
        if (!cancelled)
          setRetentionError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [loadRetention]);

  const onSaveRetention = async () => {
    if (!retention) return;
    setRetentionError(null);
    setRetentionStatus(null);
    try {
      const out = await saveRetention(retention);
      if (!out.ok) {
        setRetentionError(out.error);
        return;
      }
      setRetention(out.retention);
      setRetentionStatus("Saved.");
    } catch (e) {
      setRetentionError(e instanceof Error ? e.message : String(e));
    }
  };

  const onExport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      const payload = await runExport();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clearday-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  };

  const onPurgeConfirm = async () => {
    setPurgeBusy(true);
    setPurgeError(null);
    setPurgeStatus(null);
    try {
      const out = await runPurge(purgeInput);
      if (!out.ok) {
        setPurgeError(out.error);
        return;
      }
      setPurgeStatus(
        `Purged ${out.deleted.signals} signals and ${out.deleted.signal_rollups} rollups.`,
      );
      setPurgeOpen(false);
      setPurgeInput("");
    } catch (e) {
      setPurgeError(e instanceof Error ? e.message : String(e));
    } finally {
      setPurgeBusy(false);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Data & privacy</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Export or purge your Signals and rollups, and override how long raw
        Signals are retained before rollup.
      </p>

      <div className="mt-4 grid gap-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-700">Export all data</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Downloads a JSON file with all your Signals, rollups, settings, and
            inbox rules. Excludes encrypted secrets.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onExport}
              disabled={exportBusy}
              className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {exportBusy ? "Exporting…" : "Export all data"}
            </button>
            {exportError && (
              <p role="alert" className="text-sm text-red-700">
                {exportError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm">
            <span className="text-zinc-700">Retention (days)</span>
            <input
              type="number"
              min={MIN_RETENTION_DAYS}
              max={MAX_RETENTION_DAYS}
              className="mt-1 block w-32 rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={retention?.retention_days ?? DEFAULT_RETENTION_DAYS}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setRetention({ retention_days: n });
              }}
            />
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            Raw Signals older than this are rolled up into period aggregates and
            removed from the hot table. Default: {DEFAULT_RETENTION_DAYS}.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onSaveRetention}
              disabled={retention === null}
              className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Save retention
            </button>
            {retentionStatus && (
              <output className="text-sm text-emerald-700">
                {retentionStatus}
              </output>
            )}
            {retentionError && (
              <p role="alert" className="text-sm text-red-700">
                {retentionError}
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-red-700">Purge all data</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Permanently deletes every Signal and rollup. This cannot be undone.
          </p>
          {!purgeOpen ? (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPurgeOpen(true);
                  setPurgeStatus(null);
                  setPurgeError(null);
                }}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Purge all data…
              </button>
              {purgeStatus && (
                <output className="text-sm text-emerald-700">
                  {purgeStatus}
                </output>
              )}
            </div>
          ) : (
            <div
              role="dialog"
              aria-label="Confirm purge"
              className="mt-2 rounded border border-red-300 bg-red-50 p-3"
            >
              <p className="text-sm text-red-800">
                Type <code className="font-mono">{PURGE_CONFIRMATION}</code> to
                confirm. This cannot be undone.
              </p>
              <input
                type="text"
                aria-label="Purge confirmation"
                className="mt-2 block w-full rounded border border-red-300 px-2 py-1.5 text-sm"
                value={purgeInput}
                onChange={(e) => setPurgeInput(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onPurgeConfirm}
                  disabled={purgeInput !== PURGE_CONFIRMATION || purgeBusy}
                  className="rounded border border-red-400 bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {purgeBusy ? "Purging…" : "Confirm purge"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPurgeOpen(false);
                    setPurgeInput("");
                  }}
                  disabled={purgeBusy}
                  className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                {purgeError && (
                  <p role="alert" className="text-sm text-red-700">
                    {purgeError}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const INTEGRATION_LABELS: Record<string, string> = {
  github: "GitHub",
  slack: "Slack",
  google: "Google Calendar",
  linear: "Linear",
  jira: "Jira",
};

type IntegrationsLoader = () => Promise<{ integrations: IntegrationView[] }>;
type IntegrationsDisconnect = (
  provider: string,
) => Promise<{ ok: boolean; error?: string }>;
type IntegrationsConnectUrl = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

export function IntegrationsPanel({
  loader,
  disconnect,
  connectUrl,
  openUrl,
}: {
  loader?: IntegrationsLoader;
  disconnect?: IntegrationsDisconnect;
  connectUrl?: IntegrationsConnectUrl;
  openUrl?: (url: string) => void;
} = {}) {
  const [integrations, setIntegrations] = useState<IntegrationView[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  const load = useMemo(
    () =>
      loader ??
      (() =>
        apiFetch("/api/integrations") as Promise<{
          integrations: IntegrationView[];
        }>),
    [loader],
  );
  const doDisconnect = useMemo(
    () =>
      disconnect ??
      ((provider: string) =>
        apiFetch(`/api/integrations/${provider}`, {
          method: "DELETE",
        }) as Promise<{ ok: boolean; error?: string }>),
    [disconnect],
  );
  const doConnectUrl = useMemo(
    () =>
      connectUrl ??
      ((provider: string) =>
        apiFetch(`/api/providers/${provider}/connect-url`) as Promise<{
          ok: boolean;
          url?: string;
          error?: string;
        }>),
    [connectUrl],
  );
  const doOpen = useMemo(
    () =>
      openUrl ??
      ((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      }),
    [openUrl],
  );

  const refresh = useCallback(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (!cancelled) setIntegrations(body.integrations);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(refresh, [refresh]);

  const onDisconnect = async (provider: string) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const out = await doDisconnect(provider);
      if (!out.ok) {
        setError(out.error ?? "disconnect failed");
        return;
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProvider(null);
    }
  };

  const onReauthorize = async (provider: string) => {
    setBusyProvider(provider);
    setError(null);
    try {
      const out = await doConnectUrl(provider);
      if (out.ok && out.url) doOpen(out.url);
      else setError(out.error ?? "could not start connection");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Integrations</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Per-provider connection detail. Disconnect clears the stored OAuth
        tokens; reauthorize re-runs the OAuth flow through the auth-proxy.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {integrations == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {integrations && (
        <ul className="mt-4 grid gap-2">
          {integrations.map((i) => {
            const label = INTEGRATION_LABELS[i.provider] ?? i.provider;
            const busy = busyProvider === i.provider;
            return (
              <li
                key={i.provider}
                aria-label={`${label} integration`}
                className="rounded border border-zinc-200 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <output
                      aria-label={`${label} ${i.status}`}
                      data-status={i.status === "connected" ? "ok" : "neutral"}
                      className={`h-2 w-2 rounded-full ${
                        i.status === "connected"
                          ? "bg-emerald-500"
                          : "bg-zinc-300"
                      }`}
                    />
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-zinc-500">
                      {i.status === "connected" ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReauthorize(i.provider)}
                      disabled={busy}
                      className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {i.status === "connected" ? "Reauthorize" : "Connect"}
                    </button>
                    {i.status === "connected" && (
                      <button
                        type="button"
                        onClick={() => onDisconnect(i.provider)}
                        disabled={busy}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
                {i.status === "connected" && (
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-xs">
                    {i.account_id && (
                      <>
                        <dt className="text-zinc-500">Account</dt>
                        <dd>
                          <code className="font-mono">{i.account_id}</code>
                        </dd>
                      </>
                    )}
                    {i.scopes.length > 0 && (
                      <>
                        <dt className="text-zinc-500">Scopes</dt>
                        <dd className="font-mono">{i.scopes.join(", ")}</dd>
                      </>
                    )}
                    <dt className="text-zinc-500">Last sync</dt>
                    <dd>
                      {i.last_sync_at
                        ? formatRelative(i.last_sync_at)
                        : "never"}
                    </dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
