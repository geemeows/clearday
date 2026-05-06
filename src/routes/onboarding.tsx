import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { apiFetch } from "#/lib/api-client";
import { signOut, useAuth } from "#/lib/auth";

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
    <main className="min-h-screen bg-background px-4 py-12">
      <OnboardingHero onFinish={() => navigate({ to: "/today" })} />
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
  const loadSuggestions = useMemo(
    () =>
      suggestionsLoader ??
      (() => apiFetch("/api/slack/channels") as ReturnType<SuggestionsLoader>),
    [suggestionsLoader],
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

  const onSuggest = useCallback(async () => {
    if (draft == null) return;
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const out = await loadSuggestions();
      if (!out.ok) {
        setError(out.error || "could not load Slack channels");
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
      setError(e instanceof Error ? e.message : "suggest failed");
    } finally {
      setBusy(false);
    }
  }, [draft, loadSuggestions]);

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
            <button
              type="button"
              onClick={onSuggest}
              disabled={busy}
              className="rounded border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Suggest from Slack
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
