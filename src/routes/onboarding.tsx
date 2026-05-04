import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "#/lib/api-client";
import { signOut, useAuth } from "#/lib/auth";
import {
  AiProviderPanel,
  NotificationsPanel,
  QuietHoursPanel,
} from "#/routes/_app.settings";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.loading) return;
    if (!context.auth.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: OnboardingPage,
});

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "providers", label: "Connect providers" },
  { id: "channels", label: "Alert channels" },
  { id: "quiet", label: "Quiet hours" },
  { id: "ai", label: "AI provider" },
  { id: "slack-allowlist", label: "Slack channels" },
];

type StepId = "providers" | "channels" | "quiet" | "ai" | "slack-allowlist";

function OnboardingPage() {
  const { rejected, session } = useAuth();
  const navigate = useNavigate();

  if (rejected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">
            Not authorized for this deployment
          </h1>
          <p className="text-sm text-zinc-500">
            <code>{session?.user.email}</code> isn't the allowed email.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <OnboardingWizard onFinish={() => navigate({ to: "/today" })} />
    </main>
  );
}

export type CompleteFn = () => Promise<{ ok: true }>;

export function OnboardingWizard({
  onFinish,
  complete,
}: {
  onFinish: () => void;
  complete?: CompleteFn;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const step = STEPS[stepIndex];

  const completeFn = useMemo(
    () =>
      complete ??
      (() =>
        apiFetch("/api/onboarding/complete", {
          method: "POST",
        }) as Promise<{ ok: true }>),
    [complete],
  );

  const advance = useCallback(async () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      return;
    }
    setBusy(true);
    try {
      await completeFn();
      onFinish();
    } finally {
      setBusy(false);
    }
  }, [stepIndex, completeFn, onFinish]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Clearday
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          A few minutes of setup turns this into your daily command center.
        </p>
      </header>

      <ol
        aria-label="Onboarding progress"
        className="mb-6 flex items-center gap-2"
      >
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === stepIndex ? "step" : undefined}
            data-step={s.id}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                i <= stepIndex ? "bg-zinc-900" : "bg-zinc-300"
              }`}
            />
            <span
              className={
                i === stepIndex ? "font-medium text-zinc-900" : "text-zinc-500"
              }
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="mx-1 text-zinc-300">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>

      <section
        aria-label={`Step ${stepIndex + 1}: ${step.label}`}
        className="rounded border border-zinc-200 bg-white p-6"
      >
        <StepBody step={step.id} />
      </section>

      <nav
        aria-label="Wizard actions"
        className="mt-4 flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0 || busy}
          className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {stepIndex === STEPS.length - 1 ? "Finish" : "Continue"}
          </button>
        </div>
      </nav>
    </div>
  );
}

function StepBody({ step }: { step: StepId }) {
  switch (step) {
    case "providers":
      return <ProvidersStep />;
    case "channels":
      return <NotificationsPanel />;
    case "quiet":
      return <QuietHoursPanel />;
    case "ai":
      return <AiProviderPanel />;
    case "slack-allowlist":
      return <SlackAllowlistPanel />;
  }
}

type ApiSource = { provider: string; status: "connected" | "disconnected" };

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  slack: "Slack",
  google: "Google Calendar",
  linear: "Linear",
  jira: "Jira",
};

type ConnectUrlFn = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

type SourcesLoader = () => Promise<{ sources: ApiSource[] }>;

export function ProvidersStep({
  loader,
  connectUrl,
  openUrl,
}: {
  loader?: SourcesLoader;
  connectUrl?: ConnectUrlFn;
  openUrl?: (url: string) => void;
} = {}) {
  const [sources, setSources] = useState<ApiSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () =>
      loader ??
      (() => apiFetch("/api/sources") as Promise<{ sources: ApiSource[] }>),
    [loader],
  );
  const connect = useMemo(
    () =>
      connectUrl ??
      (async (provider: string) =>
        apiFetch(`/api/providers/${provider}/connect-url`) as Promise<{
          ok: boolean;
          url?: string;
          error?: string;
        }>),
    [connectUrl],
  );
  const openIt = useMemo(
    () =>
      openUrl ??
      ((url: string) => {
        window.open(url, "_blank", "noopener,noreferrer");
      }),
    [openUrl],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setSources(body.sources);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onConnect = useCallback(
    async (provider: string) => {
      try {
        const out = await connect(provider);
        if (out.ok && out.url) openIt(out.url);
        else setError(out.error ?? "could not start connection");
      } catch (e) {
        setError(e instanceof Error ? e.message : "connect failed");
      }
    },
    [connect, openIt],
  );

  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">
        Connect your sources
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Clearday pulls actionable items from these. Connect at least GitHub,
        Slack, and Google Calendar to get the full picture — Linear / Jira are
        optional.
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {sources == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {sources && (
        <ul className="mt-4 divide-y divide-zinc-100 rounded border border-zinc-200">
          {Object.keys(PROVIDER_LABELS).map((id) => {
            const match = sources.find((s) => s.provider === id);
            const connected = match?.status === "connected";
            return (
              <li
                key={id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium">{PROVIDER_LABELS[id]}</span>
                <span className="flex items-center gap-3">
                  <output
                    aria-label={`${PROVIDER_LABELS[id]} ${
                      connected ? "connected" : "not connected"
                    }`}
                    data-status={connected ? "ok" : "neutral"}
                    className={`h-2 w-2 rounded-full ${
                      connected ? "bg-emerald-500" : "bg-zinc-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onConnect(id)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50"
                  >
                    {connected ? "Reauthorize" : "Connect"}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type AllowlistView = { channels: string[] };
type AllowlistLoader = () => Promise<AllowlistView>;
type AllowlistSaver = (channels: string[]) => Promise<AllowlistView>;

export function SlackAllowlistPanel({
  loader,
  saver,
}: {
  loader?: AllowlistLoader;
  saver?: AllowlistSaver;
} = {}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useMemo(
    () =>
      loader ??
      (() => apiFetch("/api/slack/allowlist") as Promise<AllowlistView>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((channels: string[]) =>
        apiFetch("/api/slack/allowlist", {
          method: "PUT",
          body: { channels },
        }) as Promise<AllowlistView>),
    [saver],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setSaved(body.channels);
        setDraft(body.channels.join("\n"));
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
    if (draft == null) return;
    const channels = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    setStatus(null);
    try {
      const body = await save(channels);
      setSaved(body.channels);
      setDraft(body.channels.join("\n"));
      setStatus("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, [draft, save]);

  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900">
        Slack channel allowlist
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Channels listed here will capture <code>@here</code> /{" "}
        <code>@channel</code> as Signals. DMs and explicit @-mentions are always
        captured. One channel ID per line (e.g. <code>C0123ABCD</code>).
      </p>

      {error && (
        <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {draft == null && !error && (
        <p className="mt-3 text-sm text-zinc-500">Loading…</p>
      )}

      {draft != null && (
        <>
          <textarea
            aria-label="Slack channel allowlist"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            disabled={busy}
            placeholder="C0123ABCD"
            className="mt-3 w-full rounded border border-zinc-200 px-2 py-1.5 font-mono text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Save
            </button>
            {saved && (
              <span className="text-xs text-zinc-500">
                {saved.length} {saved.length === 1 ? "channel" : "channels"}{" "}
                allowed
              </span>
            )}
            {status && (
              <output className="text-xs text-zinc-600">{status}</output>
            )}
          </div>
        </>
      )}
    </div>
  );
}
