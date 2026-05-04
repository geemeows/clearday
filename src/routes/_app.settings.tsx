import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { signOut, useAuth } from "#/lib/auth";

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
      <AiProviderPanel />
      <AiSafeguardsPanel />
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
