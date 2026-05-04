import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { signOut, useAuth } from "#/lib/auth";
import type {
  InboxRule,
  RuleEffect,
  RulePredicate,
} from "#/lib/inbox-rules-engine";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = useAuth();
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Signed in as <code>{session?.user.email}</code>
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-4 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
      >
        Sign out
      </button>

      <NotificationsPanel />
      <NotificationMatrixPanel />
      <QuietHoursPanel />
      <FocusBlockPanel />
      <AiProviderPanel />
      <AiSafeguardsPanel />
      <InboxRulesPanel />
    </section>
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
  tester?: () => Promise<{ ok?: boolean; error?: string }>;
} = {}) {
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        }>),
    [tester],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setEnabled(new Set(body.alert_channels));
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
    async (channel: string) => {
      if (!enabled) return;
      const next = new Set(enabled);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      setEnabled(next);
      setBusy(true);
      try {
        const body = await save([...next]);
        setEnabled(new Set(body.alert_channels));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [enabled, save],
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    try {
      const result = await test();
      if (result.ok) setStatus("Test notification sent");
      else setStatus(`Failed: ${result.error ?? "unknown error"}`);
    } catch (e) {
      setStatus(`Failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [test]);

  return (
    <section
      aria-label="Notifications"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Notifications</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Where Clearday pings you when a Signal needs you.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {enabled == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {enabled && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={enabled.has("slack_dm")}
              onChange={() => toggle("slack_dm")}
              disabled={busy}
            />
            <span>
              <strong className="font-medium">Slack self-DM</strong>
              <span className="ml-2 text-zinc-500">
                Posts to your Slackbot DM via your connected Slack account.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={sendTest}
            disabled={busy || !enabled.has("slack_dm")}
            className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            Send test notification
          </button>

          {status && (
            <output className="text-sm text-zinc-600">{status}</output>
          )}
        </div>
      )}
    </section>
  );
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
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    load()
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDraftModel(v.default_model ?? "");
        setDraftBaseUrl(v.base_url ?? "");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const selectProvider = useCallback(
    async (provider: AiProvider) => {
      setBusy(true);
      try {
        const next = await save({
          provider,
          default_model: draftModel || DEFAULT_MODELS[provider],
          base_url: draftBaseUrl || undefined,
        });
        setView(next);
        setDraftModel(next.default_model ?? DEFAULT_MODELS[provider]);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [draftBaseUrl, draftModel, save],
  );

  const saveDraft = useCallback(async () => {
    if (!view?.provider) return;
    setBusy(true);
    try {
      const next = await save({
        provider: view.provider,
        default_model: draftModel || undefined,
        base_url: draftBaseUrl || undefined,
        api_key: draftKey || undefined,
      });
      setView(next);
      setDraftKey("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [draftBaseUrl, draftKey, draftModel, save, view?.provider]);

  const runTest = useCallback(async () => {
    setBusy(true);
    setTestStatus(null);
    try {
      const result = await test();
      if (result.ok) setTestStatus(`Connected (${result.model ?? "ok"})`);
      else setTestStatus(`Failed: ${result.error ?? "unknown error"}`);
      // Reload so last_validated_at refreshes.
      const fresh = await load();
      setView(fresh);
    } catch (e) {
      setTestStatus(
        `Failed: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setBusy(false);
    }
  }, [load, test]);

  const activeProvider = view?.provider ?? null;
  const needsKey = activeProvider
    ? (AI_PROVIDERS.find((p) => p.id === activeProvider)?.needsKey ?? true)
    : true;

  return (
    <section
      aria-label="AI provider"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">AI provider</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Bring your own LLM API key. Clearday never operates a shared model.
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
                  disabled={busy}
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
              className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              disabled={busy || !activeProvider}
            />
          </label>

          {activeProvider === "ollama" && (
            <label className="block text-sm">
              <span className="block font-medium text-zinc-900">Base URL</span>
              <input
                type="text"
                value={draftBaseUrl}
                onChange={(e) => setDraftBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                disabled={busy}
              />
            </label>
          )}

          {needsKey && (
            <label className="block text-sm">
              <span className="block font-medium text-zinc-900">API key</span>
              <input
                type="password"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={
                  view.has_api_key ? "•••••• (already set)" : "Paste your key"
                }
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm font-mono"
                disabled={busy}
                autoComplete="off"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Stored encrypted. Never returned to the browser in plaintext.
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy || !activeProvider}
              className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={runTest}
              disabled={
                busy ||
                !activeProvider ||
                (needsKey && !view.has_api_key && !draftKey)
              }
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Test connection
            </button>
            {view.last_validated_at && (
              <span className="text-xs text-zinc-500">
                Last validated{" "}
                {new Date(view.last_validated_at).toLocaleString()}
              </span>
            )}
          </div>

          {testStatus && (
            <output className="block text-sm text-zinc-600">
              {testStatus}
            </output>
          )}
        </div>
      )}
    </section>
  );
}

export function AiSafeguardsPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<AiSettingsView>;
  saver?: (body: AiPutBody) => Promise<AiSettingsView>;
} = {}) {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    load()
      .then((v) => {
        if (cancelled) return;
        setView(v);
        setDraftBudget(String(v.monthly_budget_usd ?? 25));
        setDraftFallback(v.fallback_model ?? "");
        setDraftPatterns((v.redact_patterns ?? []).join("\n"));
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
    async (patch: Partial<AiPutBody>) => {
      if (!view?.provider) return;
      setBusy(true);
      try {
        const next = await save({ provider: view.provider, ...patch });
        setView(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [save, view?.provider],
  );

  const saveBudget = useCallback(async () => {
    const n = Number(draftBudget);
    if (!Number.isFinite(n) || n < 0) {
      setError("Budget must be a non-negative number.");
      return;
    }
    await persist({
      monthly_budget_usd: n,
      fallback_model: draftFallback || null,
    });
  }, [draftBudget, draftFallback, persist]);

  const savePatterns = useCallback(async () => {
    const patterns = draftPatterns
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    await persist({ redact_patterns: patterns });
  }, [draftPatterns, persist]);

  const togglePrivacy = useCallback(async () => {
    if (!view) return;
    await persist({ privacy_mode: !view.privacy_mode });
  }, [persist, view]);

  const toggleDisabled = useCallback(async () => {
    if (!view) return;
    await persist({ ai_disabled: !view.ai_disabled });
  }, [persist, view]);

  if (view == null && !error) {
    return (
      <section
        aria-label="AI safeguards"
        className="mt-8 rounded border border-zinc-200 bg-white p-5"
      >
        <h2 className="text-base font-semibold text-zinc-900">AI safeguards</h2>
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      </section>
    );
  }

  const budget = view?.monthly_budget_usd ?? 25;
  const spent = view?.month_spent_usd ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const overFallback = ratio >= 0.8;
  const overBudget = ratio >= 1;
  const pctClass = overBudget
    ? "bg-red-500"
    : overFallback
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <section
      aria-label="AI safeguards"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">AI safeguards</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Caps cost and keeps sensitive content out of the model provider.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-6">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-900">
              Monthly spend
            </span>
            <span className="text-sm text-zinc-700">
              ${spent.toFixed(2)} of ${budget.toFixed(2)}
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-zinc-100">
            <div
              className={`h-full ${pctClass}`}
              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
            />
          </div>
          {overBudget && (
            <p className="mt-2 text-sm text-red-700">
              AI disabled — monthly budget reached.
            </p>
          )}
          {overFallback && !overBudget && (
            <p className="mt-2 text-sm text-amber-700">
              Running on fallback model (≥80% of budget spent).
            </p>
          )}
        </div>

        <label className="block text-sm">
          <span className="block font-medium text-zinc-900">
            Monthly budget (USD)
          </span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={draftBudget}
            onChange={(e) => setDraftBudget(e.target.value)}
            className="mt-1 w-40 rounded border border-zinc-200 px-2 py-1.5 text-sm"
            disabled={busy}
          />
        </label>

        <label className="block text-sm">
          <span className="block font-medium text-zinc-900">
            Fallback model
          </span>
          <input
            type="text"
            value={draftFallback}
            onChange={(e) => setDraftFallback(e.target.value)}
            placeholder="e.g. gpt-4o-mini"
            className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
            disabled={busy}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Used in place of your default model once 80% of the budget has been
            spent.
          </span>
        </label>

        <button
          type="button"
          onClick={saveBudget}
          disabled={busy || !view?.provider}
          className="rounded border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Save budget
        </button>

        <label className="flex items-center gap-3 border-t border-zinc-100 pt-4 text-sm">
          <input
            type="checkbox"
            checked={!!view?.privacy_mode}
            onChange={togglePrivacy}
            disabled={busy}
          />
          <span>
            <strong className="font-medium">Redact sensitive content</strong>
            <span className="ml-2 text-zinc-500">
              Strips code blocks, secrets, paths, and PR diffs from prompts
              before they leave the Worker.
            </span>
          </span>
        </label>

        <label className="block text-sm">
          <span className="block font-medium text-zinc-900">
            Custom redaction patterns
          </span>
          <textarea
            value={draftPatterns}
            onChange={(e) => setDraftPatterns(e.target.value)}
            placeholder="One regex per line"
            rows={3}
            className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-xs"
            disabled={busy}
          />
          <button
            type="button"
            onClick={savePatterns}
            disabled={busy || !view?.provider}
            className="mt-2 rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            Save patterns
          </button>
        </label>

        <label className="flex items-center gap-3 border-t border-zinc-100 pt-4 text-sm">
          <input
            type="checkbox"
            checked={!!view?.ai_disabled}
            onChange={toggleDisabled}
            disabled={busy}
          />
          <span>
            <strong className="font-medium">Disable AI on this account</strong>
            <span className="ml-2 text-zinc-500">
              Skips every AI call regardless of budget or provider config.
            </span>
          </span>
        </label>
      </div>
    </section>
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
};

type PreferencesPatch = {
  notification_matrix?: Record<string, string[]>;
  quiet_hours_v2?: Record<string, unknown>;
  focus_block?: Record<string, unknown>;
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
// Inbox rules panel (issue #20). Lists user-defined rules with add / delete /
// enable / reorder. Each rule is a single predicate + single effect for v1
// to keep the form-shape simple; the engine itself supports rule lists with
// multiple predicates/effects for future panels.
// ---------------------------------------------------------------------------

const PREDICATE_TYPES: Array<{ id: RulePredicate["type"]; label: string }> = [
  { id: "provider", label: "Provider is" },
  { id: "kind", label: "Kind is" },
  { id: "source_match", label: "Payload field equals" },
  { id: "title_regex", label: "Title matches regex" },
];

const EFFECT_TYPES: Array<{ id: RuleEffect["type"]; label: string }> = [
  { id: "auto_dismiss", label: "Auto-dismiss" },
  { id: "snooze", label: "Snooze (minutes)" },
  { id: "tag", label: "Tag" },
];

function emptyRule(): InboxRule {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rule-${Math.random().toString(36).slice(2)}`,
    name: "",
    enabled: true,
    priority: 100,
    predicates: [{ type: "kind", kind: "mention" }],
    effects: [{ type: "auto_dismiss" }],
  };
}

export function InboxRulesPanel({
  loader,
  saver,
}: {
  loader?: () => Promise<{ rules: InboxRule[] }>;
  saver?: (
    rules: InboxRule[],
  ) => Promise<{ ok: boolean; rules?: InboxRule[]; error?: string }>;
} = {}) {
  const [rules, setRules] = useState<InboxRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useMemo(
    () =>
      loader ??
      (() => apiFetch("/api/inbox-rules") as Promise<{ rules: InboxRule[] }>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((next: InboxRule[]) =>
        apiFetch("/api/inbox-rules", {
          method: "PUT",
          body: { rules: next },
        }) as Promise<{ ok: boolean; rules?: InboxRule[]; error?: string }>),
    [saver],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setRules(body.rules);
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
    async (next: InboxRule[]) => {
      setRules(next);
      setBusy(true);
      try {
        const out = await save(next);
        if (!out.ok) {
          setError(out.error ?? "save failed");
        } else {
          if (out.rules) setRules(out.rules);
          setError(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setBusy(false);
      }
    },
    [save],
  );

  const addRule = useCallback(() => {
    if (!rules) return;
    const next = [
      ...rules,
      { ...emptyRule(), priority: rules.length + 1, name: "New rule" },
    ];
    persist(next);
  }, [persist, rules]);

  const updateRule = useCallback(
    (id: string, patch: Partial<InboxRule>) => {
      if (!rules) return;
      persist(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [persist, rules],
  );

  const deleteRule = useCallback(
    (id: string) => {
      if (!rules) return;
      persist(rules.filter((r) => r.id !== id));
    },
    [persist, rules],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      if (!rules) return;
      const idx = rules.findIndex((r) => r.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= rules.length) return;
      const next = [...rules];
      [next[idx], next[target]] = [next[target], next[idx]];
      next.forEach((r, i) => {
        r.priority = i + 1;
      });
      persist(next);
    },
    [persist, rules],
  );

  return (
    <section
      aria-label="Inbox rules"
      className="mt-8 rounded border border-zinc-200 bg-white p-5"
    >
      <h2 className="text-base font-semibold text-zinc-900">Inbox rules</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Auto-categorize, snooze, or dismiss Signals on write.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rules == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {rules && (
        <div className="mt-4 space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-zinc-500">
              No rules yet. Add one below to start shaping your inbox.
            </p>
          )}

          {rules.map((rule, i) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              busy={busy}
              isFirst={i === 0}
              isLast={i === rules.length - 1}
              onChange={(patch) => updateRule(rule.id, patch)}
              onDelete={() => deleteRule(rule.id)}
              onMoveUp={() => move(rule.id, -1)}
              onMoveDown={() => move(rule.id, 1)}
            />
          ))}

          <button
            type="button"
            onClick={addRule}
            disabled={busy}
            className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
          >
            Add rule
          </button>
        </div>
      )}
    </section>
  );
}

function RuleRow({
  rule,
  busy,
  isFirst,
  isLast,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  rule: InboxRule;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<InboxRule>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const predicate = rule.predicates[0];
  const effect = rule.effects[0];

  const setPredicateType = (t: RulePredicate["type"]) => {
    let next: RulePredicate;
    if (t === "provider") next = { type: "provider", provider: "github" };
    else if (t === "kind") next = { type: "kind", kind: "mention" };
    else if (t === "source_match")
      next = { type: "source_match", field: "author", equals: "" };
    else next = { type: "title_regex", pattern: "" };
    onChange({ predicates: [next] });
  };

  const setEffectType = (t: RuleEffect["type"]) => {
    let next: RuleEffect;
    if (t === "auto_dismiss") next = { type: "auto_dismiss" };
    else if (t === "snooze") next = { type: "snooze", minutes: 60 };
    else next = { type: "tag", tag: "" };
    onChange({ effects: [next] });
  };

  return (
    <fieldset
      aria-label={`Rule ${rule.name || rule.id}`}
      className="rounded border border-zinc-200 bg-zinc-50 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          aria-label="Rule name"
          value={rule.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name"
          disabled={busy}
          className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={() => onChange({ enabled: !rule.enabled })}
            disabled={busy}
          />
          Enabled
        </label>
        <button
          type="button"
          aria-label="Move up"
          onClick={onMoveUp}
          disabled={busy || isFirst}
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move down"
          onClick={onMoveDown}
          disabled={busy || isLast}
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Delete rule"
          onClick={onDelete}
          disabled={busy}
          className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded border border-zinc-200 bg-white p-2">
          <p className="text-xs font-medium text-zinc-500">When</p>
          <select
            aria-label="Predicate type"
            value={predicate?.type ?? "kind"}
            onChange={(e) =>
              setPredicateType(e.target.value as RulePredicate["type"])
            }
            disabled={busy}
            className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
          >
            {PREDICATE_TYPES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <PredicateInputs
            predicate={predicate}
            busy={busy}
            onChange={(p) => onChange({ predicates: [p] })}
          />
        </div>

        <div className="rounded border border-zinc-200 bg-white p-2">
          <p className="text-xs font-medium text-zinc-500">Then</p>
          <select
            aria-label="Effect type"
            value={effect?.type ?? "auto_dismiss"}
            onChange={(e) =>
              setEffectType(e.target.value as RuleEffect["type"])
            }
            disabled={busy}
            className="mt-1 w-full rounded border border-zinc-200 px-2 py-1"
          >
            {EFFECT_TYPES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <EffectInputs
            effect={effect}
            busy={busy}
            onChange={(e) => onChange({ effects: [e] })}
          />
        </div>
      </div>
    </fieldset>
  );
}

function PredicateInputs({
  predicate,
  busy,
  onChange,
}: {
  predicate: RulePredicate | undefined;
  busy: boolean;
  onChange: (p: RulePredicate) => void;
}) {
  if (!predicate) return null;
  if (predicate.type === "provider") {
    return (
      <input
        type="text"
        aria-label="Provider value"
        value={predicate.provider}
        onChange={(e) => onChange({ ...predicate, provider: e.target.value })}
        placeholder="github / slack / google"
        disabled={busy}
        className="mt-2 w-full rounded border border-zinc-200 px-2 py-1"
      />
    );
  }
  if (predicate.type === "kind") {
    return (
      <input
        type="text"
        aria-label="Kind value"
        value={predicate.kind}
        onChange={(e) => onChange({ ...predicate, kind: e.target.value })}
        placeholder="mention / pr_review_requested / …"
        disabled={busy}
        className="mt-2 w-full rounded border border-zinc-200 px-2 py-1"
      />
    );
  }
  if (predicate.type === "source_match") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          type="text"
          aria-label="Payload field"
          value={predicate.field}
          onChange={(e) => onChange({ ...predicate, field: e.target.value })}
          placeholder="field (e.g. author)"
          disabled={busy}
          className="rounded border border-zinc-200 px-2 py-1"
        />
        <input
          type="text"
          aria-label="Payload equals"
          value={predicate.equals}
          onChange={(e) => onChange({ ...predicate, equals: e.target.value })}
          placeholder="equals"
          disabled={busy}
          className="rounded border border-zinc-200 px-2 py-1"
        />
      </div>
    );
  }
  return (
    <input
      type="text"
      aria-label="Title regex"
      value={predicate.pattern}
      onChange={(e) => onChange({ ...predicate, pattern: e.target.value })}
      placeholder="^chore"
      disabled={busy}
      className="mt-2 w-full rounded border border-zinc-200 px-2 py-1 font-mono"
    />
  );
}

function EffectInputs({
  effect,
  busy,
  onChange,
}: {
  effect: RuleEffect | undefined;
  busy: boolean;
  onChange: (e: RuleEffect) => void;
}) {
  if (!effect) return null;
  if (effect.type === "auto_dismiss") {
    return (
      <p className="mt-2 text-xs text-zinc-500">
        Marks the Signal as dismissed on the spot.
      </p>
    );
  }
  if (effect.type === "snooze") {
    return (
      <input
        type="number"
        min={1}
        aria-label="Snooze minutes"
        value={effect.minutes}
        onChange={(e) =>
          onChange({ ...effect, minutes: Number(e.target.value) || 0 })
        }
        disabled={busy}
        className="mt-2 w-full rounded border border-zinc-200 px-2 py-1"
      />
    );
  }
  return (
    <input
      type="text"
      aria-label="Tag value"
      value={effect.tag}
      onChange={(e) => onChange({ ...effect, tag: e.target.value })}
      placeholder="tag"
      disabled={busy}
      className="mt-2 w-full rounded border border-zinc-200 px-2 py-1"
    />
  );
}
