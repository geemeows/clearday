import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/coss/button";
import { SettingsPanel } from "#/components/ui/SettingsPanel";
import { signOut, useAuth } from "#/features/auth/auth";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { useAsyncPanel } from "#/hooks/useAsyncPanel";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.loading) return;
    if (!context.auth.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { rejected, session } = useAuth();
  const navigate = useNavigate();

  if (rejected) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">
            Not authorized for this deployment
          </h1>
          <p className="text-sm text-muted-foreground">
            <code>{session?.user.email}</code> isn't the allowed email.
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <OnboardingFlow
        onFinish={() => navigate({ to: "/today" })}
        signedInEmail={session?.user.email ?? null}
      />
    </main>
  );
}

export type CompleteFn = () => Promise<{ ok: true }>;

type ProviderId = "github" | "slack" | "google";

type ProviderCardSpec = {
  id: ProviderId;
  label: string;
  description: string;
  glyph: SourceKind;
  scopes: string;
};

const PROVIDER_CARDS: ProviderCardSpec[] = [
  {
    id: "github",
    label: "GitHub",
    description: "Pull requests, reviews, CI status, and @-mentions.",
    glyph: "git",
    scopes: "read:user, repo",
  },
  {
    id: "slack",
    label: "Slack",
    description: "DMs, @-mentions, and allow-listed channel broadcasts.",
    glyph: "slack",
    scopes: "channels:read, chat:write, dnd:write",
  },
  {
    id: "google",
    label: "Google Calendar",
    description: "Today's meetings, agenda, and focus-block scheduling.",
    glyph: "cal",
    scopes: "calendar.events",
  },
];

type ApiSource = {
  provider: string;
  status: "connected" | "disconnected" | "rate_limited" | "auth_failed";
};

type SourcesLoader = () => Promise<{ sources: ApiSource[] }>;
type ConnectUrlFn = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

export function OnboardingHero({
  onFinish,
  complete,
  loader,
  connectUrl,
  openUrl,
}: {
  onFinish: () => void;
  complete?: CompleteFn;
  loader?: SourcesLoader;
  connectUrl?: ConnectUrlFn;
  openUrl?: (url: string) => void;
}) {
  const [sources, setSources] = useState<ApiSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const completeFn = useMemo(
    () =>
      complete ??
      (() =>
        apiFetch("/api/onboarding/complete", {
          method: "POST",
        }) as Promise<{ ok: true }>),
    [complete],
  );
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
    const refresh = () => {
      load()
        .then((body) => {
          if (cancelled) return;
          setSources(body.sources);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "failed to load");
        });
    };
    refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const onConnect = useCallback(
    async (provider: ProviderId) => {
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

  const isConnected = useCallback(
    (id: ProviderId) => {
      const s = sources?.find((x) => x.provider === id);
      return !!s && s.status !== "disconnected";
    },
    [sources],
  );

  const anyConnected = !!sources?.some(
    (s) =>
      (s.provider === "github" ||
        s.provider === "slack" ||
        s.provider === "google") &&
      s.status !== "disconnected",
  );

  const onContinue = useCallback(async () => {
    setBusy(true);
    try {
      await completeFn();
      onFinish();
    } finally {
      setBusy(false);
    }
  }, [completeFn, onFinish]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-10 flex flex-col items-center gap-4 text-center">
        <img
          src="/brand/devy_logo.svg"
          alt="Devy"
          className="h-16 w-16"
          width={64}
          height={64}
        />
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome to Devy
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Connect your sources to start your daily command center. You can
          change any of these later from Settings.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <ul aria-label="Connect providers" className="grid gap-3">
        {PROVIDER_CARDS.map((card) => {
          const connected = isConnected(card.id);
          return (
            <li
              key={card.id}
              aria-label={`${card.label} provider card`}
              className="flex items-center gap-4 rounded-md border border-border bg-card p-4"
            >
              <SourceGlyph source={card.glyph} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {card.label}
                  </span>
                  {connected && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <Check aria-hidden className="size-3" />
                      Connected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {card.description}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {card.scopes}
                </p>
              </div>
              <Button
                type="button"
                variant={connected ? "outline" : "default"}
                onClick={() => onConnect(card.id)}
              >
                {connected ? "Reconnect" : "Connect"}
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex justify-end">
        <Button
          type="button"
          size="lg"
          onClick={onContinue}
          disabled={!anyConnected || busy}
        >
          Continue to Devy
        </Button>
      </div>
    </div>
  );
}

type AllowlistView = { channels: string[] };
type AllowlistLoader = () => Promise<AllowlistView>;
type AllowlistSaver = (channels: string[]) => Promise<AllowlistView>;
type SlackChannelSuggestion = { id: string; name: string; is_private: boolean };
type SuggestionsLoader = () => Promise<
  | { ok: true; channels: SlackChannelSuggestion[] }
  | { ok: false; error: string; needs_reauth?: boolean }
>;

export function SlackAllowlistPanel({
  loader,
  saver,
  suggestionsLoader,
}: {
  loader?: AllowlistLoader;
  saver?: AllowlistSaver;
  suggestionsLoader?: SuggestionsLoader;
} = {}) {
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
  const loadSuggestions = useMemo(
    () =>
      suggestionsLoader ??
      (() => apiFetch("/api/slack/channels") as ReturnType<SuggestionsLoader>),
    [suggestionsLoader],
  );

  const {
    data,
    error: panelError,
    busy,
    persist,
  } = useAsyncPanel<AllowlistView>({
    load,
    save: async (next) => {
      await save(next.channels);
    },
  });

  const [draft, setDraft] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Sync the textarea draft from the persisted snapshot whenever a fresh one
  // lands (initial load and after a successful save).
  const lastDataRef = useRef<AllowlistView | null>(null);
  useEffect(() => {
    if (data && data !== lastDataRef.current) {
      setDraft(data.channels.join("\n"));
      lastDataRef.current = data;
    }
  }, [data]);

  const onSave = useCallback(() => {
    if (draft == null) return;
    const channels = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setActionError(null);
    setStatus(null);
    setDraft(channels.join("\n"));
    persist({ channels });
  }, [draft, persist]);

  const onSuggest = useCallback(async () => {
    if (draft == null) return;
    setSuggesting(true);
    setStatus(null);
    setActionError(null);
    try {
      const out = await loadSuggestions();
      if (!out.ok) {
        setActionError(out.error || "could not load Slack channels");
        return;
      }
      const existing = draft
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = [...existing];
      for (const ch of out.channels) {
        if (!merged.includes(ch.id)) merged.push(ch.id);
      }
      setDraft(merged.join("\n"));
      setStatus(
        out.channels.length === 0
          ? "No channels found"
          : `Added ${out.channels.length} from Slack`,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "suggest failed");
    } finally {
      setSuggesting(false);
    }
  }, [draft, loadSuggestions]);

  const error = actionError ?? panelError;
  const isBusy = busy || suggesting;

  return (
    <SettingsPanel
      title="Slack allowlist"
      desc="Channels listed here capture @here / @channel as Signals. DMs and explicit @-mentions are always captured. One channel ID per line (e.g. C0123ABCD)."
      error={error}
      busy={busy && !data}
    >
      {draft != null && (
        <>
          <textarea
            aria-label="Slack channel allowlist"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            disabled={isBusy}
            placeholder="C0123ABCD"
            className="mt-3 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-sm"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={isBusy}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onSuggest}
              disabled={isBusy}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
            >
              Suggest from Slack
            </button>
            {data && (
              <span className="text-muted-foreground text-xs">
                {data.channels.length}{" "}
                {data.channels.length === 1 ? "channel" : "channels"} allowed
              </span>
            )}
            {status && (
              <output className="text-muted-foreground text-xs">
                {status}
              </output>
            )}
          </div>
        </>
      )}
    </SettingsPanel>
  );
}

// ────────────────────────── Multi-step Onboarding flow ──────────────────────────

const STEPS = [
  { name: "Welcome", desc: "Confirm deployment" },
  { name: "Integrations", desc: "GitHub, Calendar, Slack" },
  { name: "AI provider", desc: "Bring your own key" },
  { name: "Alerts", desc: "When Devy taps you" },
  { name: "Ready", desc: "Open your day" },
] as const;

type AiProviderId =
  | "gemini"
  | "groq"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "skip";

const AI_PROVIDER_TILES: ReadonlyArray<{
  id: AiProviderId;
  name: string;
  free?: boolean;
  model: string;
  tag: string;
}> = [
  { id: "gemini", name: "Gemini", free: true, model: "gemini-2.5-flash", tag: "Fast, generous quota" },
  { id: "groq", name: "Groq", free: true, model: "llama-3.1-70b", tag: "Cheapest tokens" },
  { id: "openai", name: "OpenAI", model: "gpt-4o-mini", tag: "Reliable default" },
  { id: "anthropic", name: "Anthropic", model: "claude-haiku-4-5", tag: "Tight summaries" },
  { id: "openrouter", name: "OpenRouter", model: "any · routed", tag: "One key, all models" },
  { id: "skip", name: "Skip for now", model: "no briefing", tag: "Add a key later" },
];

const THRESHOLD_MINS = [2, 5, 10, 15, 30] as const;

export function OnboardingFlow({
  onFinish,
  complete,
  loader,
  connectUrl,
  openUrl,
  signedInEmail,
}: {
  onFinish: () => void;
  complete?: CompleteFn;
  loader?: SourcesLoader;
  connectUrl?: ConnectUrlFn;
  openUrl?: (url: string) => void;
  signedInEmail?: string | null;
}) {
  const [step, setStep] = useState(0);
  const [sources, setSources] = useState<ApiSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProviderId>("gemini");
  const [alertSlack, setAlertSlack] = useState(true);
  const [alertPush, setAlertPush] = useState(false);
  const [threshold, setThreshold] = useState<number>(10);
  const [busy, setBusy] = useState(false);

  const completeFn = useMemo(
    () =>
      complete ??
      (() =>
        apiFetch("/api/onboarding/complete", {
          method: "POST",
        }) as Promise<{ ok: true }>),
    [complete],
  );
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
        if (!cancelled) setSources(body.sources);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const isConnected = useCallback(
    (id: ProviderId) => {
      const s = sources?.find((x) => x.provider === id);
      return !!s && s.status !== "disconnected";
    },
    [sources],
  );

  const onConnect = useCallback(
    async (provider: ProviderId) => {
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

  const isLast = step === STEPS.length - 1;
  const goNext = useCallback(async () => {
    if (!isLast) {
      setStep((s) => s + 1);
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    try {
      await completeFn();
      onFinish();
    } finally {
      setBusy(false);
    }
  }, [isLast, completeFn, onFinish]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1080px] flex-col px-8 pt-7 pb-16">
      {/* topbar */}
      <div className="mb-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/brand/devy_logo.svg"
            alt=""
            className="h-[26px] w-[26px]"
            width={26}
            height={26}
          />
          <span className="text-[15px] font-semibold tracking-tight">Devy</span>
        </div>
        <Link
          to="/today"
          className="text-[13px] text-muted-foreground hover:text-foreground"
        >
          Skip setup →
        </Link>
      </div>

      <div className="grid flex-1 items-start gap-14 lg:grid-cols-[240px_1fr]">
        {/* stepper rail */}
        <aside aria-label="Onboarding steps" className="lg:sticky lg:top-7">
          <h4 className="mb-4 pl-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
            Setup
          </h4>
          <ol className="relative m-0 list-none p-0">
            <span
              aria-hidden
              className="absolute top-3.5 bottom-3.5 left-[13px] w-px bg-border"
            />
            {STEPS.map((s, i) => {
              const state = i < step ? "done" : i === step ? "active" : "pending";
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    aria-label={`Go to step ${i + 1}: ${s.name}`}
                    aria-current={state === "active" ? "step" : undefined}
                    data-state={state}
                    onClick={() => setStep(i)}
                    className="relative flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "z-10 flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        state === "active" &&
                          "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_15%,transparent)]",
                        state === "done" && "border-primary/30 bg-primary/10 text-primary",
                        state === "pending" && "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {state === "done" ? <Check className="size-3" aria-hidden /> : i + 1}
                    </span>
                    <span className="flex flex-col pt-0.5">
                      <span
                        className={cn(
                          "text-[13.5px]",
                          state === "active"
                            ? "font-semibold text-foreground"
                            : state === "done"
                              ? "font-medium text-foreground"
                              : "font-medium text-muted-foreground",
                        )}
                      >
                        {s.name}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground/80">
                        {s.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* body */}
        <section aria-live="polite" className="min-w-0">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {step === 0 && (
            <WelcomeStep signedInEmail={signedInEmail ?? "you@example.com"} />
          )}
          {step === 1 && (
            <IntegrationsStep isConnected={isConnected} onConnect={onConnect} />
          )}
          {step === 2 && (
            <AiProviderStep selected={aiProvider} onSelect={setAiProvider} />
          )}
          {step === 3 && (
            <AlertsStep
              slack={alertSlack}
              push={alertPush}
              threshold={threshold}
              onToggleSlack={() => setAlertSlack((v) => !v)}
              onTogglePush={() => setAlertPush((v) => !v)}
              onThreshold={setThreshold}
            />
          )}
          {step === 4 && <ReadyStep providerLabel={labelFor(aiProvider)} threshold={threshold} />}

          <div className="mt-10 flex items-center gap-3 border-t border-border/60 pt-5">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={step === 0 || busy}
            >
              ← Back
            </Button>
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
            <Button type="button" onClick={goNext} disabled={busy}>
              {isLast ? "Open Devy →" : "Continue →"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function labelFor(id: AiProviderId): string {
  return AI_PROVIDER_TILES.find((t) => t.id === id)?.name ?? "Gemini";
}

function StepEyebrow({ index }: { index: number }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.4px] text-primary">
      Step {index + 1} of {STEPS.length}
    </div>
  );
}

function StepHeader({ index, title, sub }: { index: number; title: string; sub: string }) {
  return (
    <>
      <StepEyebrow index={index} />
      <h1 className="mb-2.5 text-3xl font-semibold leading-tight tracking-tight">
        {title}
      </h1>
      <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        {sub}
      </p>
    </>
  );
}

function WelcomeStep({ signedInEmail }: { signedInEmail: string }) {
  return (
    <div>
      <StepHeader
        index={0}
        title="Welcome to your Devy."
        sub="Your backend is up and you're signed in. Let's make sure the deployment looks right, then connect the tools that feed your inbox."
      />
      <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2">
        <SummaryCell label="Signed in" value={signedInEmail} mono />
        <SummaryCell label="Worker" value="devy.kovacs.dev" mono trailing={
          <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-600">
            <span className="size-1.5 rounded-full bg-current" /> healthy
          </span>
        } />
        <SummaryCell label="Supabase project" value="clearday-prod.supabase.co" mono />
        <SummaryCell label="Allowed email" value={signedInEmail} mono />
      </div>
      <div className="mt-6 flex items-start gap-2.5 rounded-md border border-primary/20 bg-primary/5 px-4 py-3.5 text-[13px] leading-relaxed text-foreground/90">
        <span className="mt-0.5 inline-flex size-[18px] flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          i
        </span>
        <div>
          <b className="text-foreground">Tokens stay on this Worker.</b> Every provider you connect next stores its refresh token in <i>your</i> Supabase. Clearday-the-project never sees them.
        </div>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  mono,
  trailing,
}: {
  label: string;
  value: string;
  mono?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 px-5 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(-n+2)]:border-b">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-[13px] text-foreground", mono && "font-mono")}>
        {value}
        {trailing}
      </div>
    </div>
  );
}

function IntegrationsStep({
  isConnected,
  onConnect,
}: {
  isConnected: (id: ProviderId) => boolean;
  onConnect: (id: ProviderId) => void;
}) {
  return (
    <div>
      <StepHeader
        index={1}
        title="Connect your sources."
        sub="v1 reads from these three. Each opens a consent screen, then drops the refresh token into your Supabase. Read-only — Devy never writes back."
      />
      <ul aria-label="Connect providers" className="overflow-hidden rounded-lg border border-border bg-card">
        {PROVIDER_CARDS.map((card, i) => {
          const connected = isConnected(card.id);
          const required = card.id !== "slack";
          return (
            <li
              key={card.id}
              aria-label={`${card.label} provider card`}
              className={cn(
                "flex items-center gap-4 px-5 py-4",
                i < PROVIDER_CARDS.length - 1 && "border-b border-border/60",
              )}
            >
              <SourceGlyph source={card.glyph} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground">
                  {card.label}
                  {required && (
                    <span className="rounded border border-border px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.3px] text-muted-foreground">
                      required
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                  {card.description}
                </p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Scopes:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {card.scopes}
                  </code>
                </p>
              </div>
              <Button
                type="button"
                variant={connected ? "outline" : "default"}
                onClick={() => onConnect(card.id)}
              >
                {connected ? (
                  <>
                    <Check className="size-3.5" aria-hidden /> Connected
                  </>
                ) : (
                  "Connect"
                )}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground">
        Tickets (Jira / Linear) are not in v1 — they ride along with the issue tracker that lands first.
      </p>
    </div>
  );
}

function AiProviderStep({
  selected,
  onSelect,
}: {
  selected: AiProviderId;
  onSelect: (id: AiProviderId) => void;
}) {
  return (
    <div>
      <StepHeader
        index={2}
        title="Pick your AI provider."
        sub="Devy uses one chat-completion call per morning briefing. Bring your own key — most of these have a generous free tier so you don't pay anything to dogfood."
      />
      <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {AI_PROVIDER_TILES.map((tile) => {
          const isSelected = tile.id === selected;
          return (
            <button
              key={tile.id}
              type="button"
              aria-pressed={isSelected}
              data-provider={tile.id}
              onClick={() => onSelect(tile.id)}
              className={cn(
                "flex flex-col gap-1 rounded-md border bg-card p-3.5 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
                  : "border-border hover:border-border hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between text-[13.5px] font-semibold text-foreground">
                <span>{tile.name}</span>
                {tile.free && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[11px] font-semibold text-emerald-600">
                    free tier
                  </span>
                )}
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                {tile.model}
              </div>
              <div className="text-[11.5px] text-muted-foreground">{tile.tag}</div>
            </button>
          );
        })}
      </div>
      {selected !== "skip" && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium">
            <span>API key</span>
            <span className="font-normal text-muted-foreground">
              Stored in your Supabase. Never sent to Clearday.
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-… / AIza… / gsk_…"
            autoComplete="off"
            className="h-[38px] w-full rounded-md border border-input bg-background px-3 font-mono text-[13.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/24"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Persisted in the AI settings tab — final wiring happens there.
          </p>
        </div>
      )}
    </div>
  );
}

function AlertsStep({
  slack,
  push,
  threshold,
  onToggleSlack,
  onTogglePush,
  onThreshold,
}: {
  slack: boolean;
  push: boolean;
  threshold: number;
  onToggleSlack: () => void;
  onTogglePush: () => void;
  onThreshold: (n: number) => void;
}) {
  return (
    <div>
      <StepHeader
        index={3}
        title="Where should Devy tap you?"
        sub="When a meeting's about to start or someone needs you, Devy can ping you outside the app. Pick one or both — both run when enabled."
      />
      <AlertRow
        on={slack}
        onToggle={onToggleSlack}
        title="Slack self-DM"
        badge="recommended"
        desc="Devy posts to your own Slackbot DM. Reuses the Slack you just connected — nothing extra to set up."
        glyph={<SourceGlyph source="slack" size={36} />}
      />
      <AlertRow
        on={push}
        onToggle={onTogglePush}
        title="Web Push (PWA)"
        desc="Install Devy as a PWA and receive OS-level notifications. Requires a subscription on this device."
        glyph={<SourceGlyph source="ai" size={36} />}
      />
      <div className="mt-2.5 rounded-lg border border-border bg-card p-5">
        <div className="mb-1 text-[14.5px] font-semibold">Pre-meeting alert</div>
        <p className="mb-3.5 text-[12.5px] text-muted-foreground">
          How early Devy nudges you before a calendar event with a video link.
        </p>
        <div className="flex flex-wrap items-center gap-3.5 border-t border-dashed border-border/70 pt-3.5">
          <span className="text-xs text-muted-foreground">Nudge me</span>
          <div
            role="radiogroup"
            aria-label="Pre-meeting alert lead time"
            className="inline-flex gap-0.5 rounded-full border border-border/70 bg-muted p-[3px]"
          >
            {THRESHOLD_MINS.map((m) => {
              const active = m === threshold;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-pressed={active}
                  onClick={() => onThreshold(m)}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-mono text-xs leading-none transition-colors",
                    active
                      ? "bg-background text-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_8%,transparent),0_0_0_1px_var(--border)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m} min
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            <b className="font-medium text-foreground">{threshold} min</b> before the meeting
          </span>
        </div>
      </div>
    </div>
  );
}

function AlertRow({
  on,
  onToggle,
  title,
  badge,
  desc,
  glyph,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  badge?: string;
  desc: string;
  glyph: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-start gap-4 rounded-lg border bg-card px-5 py-4",
        on ? "border-primary/30" : "border-border",
      )}
    >
      {glyph}
      <div className="flex-1">
        <div className="flex items-center gap-2 text-[14.5px] font-semibold">
          {title}
          {badge && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/12 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.3px] text-emerald-600">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Toggle ${title}`}
        onClick={onToggle}
        data-on={on ? "true" : "false"}
        className={cn(
          "relative h-5 w-9 flex-shrink-0 rounded-full border-0 transition-colors",
          on ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform",
            on && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

function ReadyStep({ providerLabel, threshold }: { providerLabel: string; threshold: number }) {
  return (
    <div>
      <StepHeader
        index={4}
        title="You're all set."
        sub="First poll runs in about 30 seconds. Here's what Devy will do for you."
      />
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/12 text-primary">
              <Check className="size-3.5" aria-hidden />
            </span>
            What's wired up
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {[
              "GitHub PRs (reviewer, author, assignee) — polls every 90 seconds",
              "Google Calendar primary — polls every 2 minutes",
              "Slack DMs, mentions, and threads you've replied in",
              `Morning briefing via ${providerLabel} — daily at 07:30`,
              `Slack self-DM alerts · ${threshold}-min meeting heads-up`,
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-[13px] leading-snug text-foreground/90">
                <Check className="mt-0.5 size-3.5 flex-shrink-0 text-emerald-600" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/12 text-primary">
              ✦
            </span>
            Try next
          </div>
          <div className="flex flex-col gap-2">
            {[
              "Press ⌘K on any page to jump anywhere or run a command.",
              'Click "Start focus" in the sidebar to write a Calendar block + Slack snooze in one go.',
              "Pin a channel to Slack mentions if you want @here to count there too.",
            ].map((text, i) => (
              <div
                key={text}
                className="flex items-start gap-2.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5"
              >
                <span className="w-[18px] flex-shrink-0 font-mono text-[11.5px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[12.5px] leading-snug text-foreground">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
