// Cmd-K command palette. Opens from anywhere via Cmd/Ctrl-K, searches
// across Signals (PRs / Tickets / Mentions / Meetings), and offers an
// "Ask AI" footer that routes the typed query to the LLM with the
// current Signal list as retrieval context.
//
// Tracer-bullet scope: tickets stay in the chip row but disabled until
// the Jira/Linear adapters land (#18). Other scopes are functional.

import {
  Calendar as CalIcon,
  ExternalLink,
  Github,
  Slack,
  Sparkles,
  SquareKanban,
  Trello,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiFetch } from "#/lib/api-client";
import type { AskAiResult } from "#/lib/ask-ai-api";
import { cn } from "#/lib/cn";
import type { Signal, SignalProvider } from "#/lib/signal";

export type Scope = "all" | "prs" | "tickets" | "mentions" | "meetings";

type ScopeChip = { id: Scope; label: string; enabled: boolean };

const SCOPES: ScopeChip[] = [
  { id: "all", label: "All", enabled: true },
  { id: "prs", label: "PRs", enabled: true },
  { id: "tickets", label: "Tickets", enabled: true },
  { id: "mentions", label: "Mentions", enabled: true },
  { id: "meetings", label: "Meetings", enabled: true },
];

type Result = Signal & { id: string };

export type Searcher = (
  scope: Scope,
  query: string,
) => Promise<{ signals: Result[] }>;

export type Asker = (q: string, signalIds: string[]) => Promise<AskAiResult>;

const defaultSearcher: Searcher = async (scope, query) => {
  const params = new URLSearchParams({ filter: scope, limit: "20" });
  if (query.trim()) params.set("q", query.trim());
  return (await apiFetch(`/api/signals?${params.toString()}`)) as {
    signals: Result[];
  };
};

const defaultAsker: Asker = async (q, signalIds) =>
  (await apiFetch("/api/ai/ask", {
    method: "POST",
    body: { q, signal_ids: signalIds },
  })) as AskAiResult;

export function CommandPalette({
  searcher,
  asker,
  initialOpen = false,
}: {
  searcher?: Searcher;
  asker?: Asker;
  initialOpen?: boolean;
} = {}) {
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;
  return (
    <PaletteModal
      onClose={() => setOpen(false)}
      searcher={searcher ?? defaultSearcher}
      asker={asker ?? defaultAsker}
    />
  );
}

type AnswerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: AskAiResult };

function PaletteModal({
  onClose,
  searcher,
  asker,
}: {
  onClose: () => void;
  searcher: Searcher;
  asker: Asker;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [results, setResults] = useState<Result[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answer, setAnswer] = useState<AnswerState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced live search.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      searcher(scope, query)
        .then((body) => {
          if (cancelled) return;
          setResults(body.signals);
          setActiveIndex(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [scope, query, searcher]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const enabledScopes = useMemo(() => SCOPES.filter((s) => s.enabled), []);

  const askAi = useCallback(async () => {
    if (!query.trim()) return;
    setAnswer({ kind: "loading" });
    try {
      const result = await asker(
        query.trim(),
        results.slice(0, 10).map((r) => r.id),
      );
      setAnswer({ kind: "result", result });
    } catch (err) {
      setAnswer({
        kind: "result",
        result: {
          ok: false,
          reason: "error",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, [asker, query, results]);

  const openResult = useCallback(
    (r: Result) => {
      if (r.url) window.open(r.url, "_blank", "noreferrer");
      onClose();
    },
    [onClose],
  );

  const cycleScope = useCallback(
    (direction: 1 | -1) => {
      const idx = enabledScopes.findIndex((s) => s.id === scope);
      const next =
        enabledScopes[
          (idx + direction + enabledScopes.length) % enabledScopes.length
        ];
      setScope(next.id);
    },
    [enabledScopes, scope],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        cycleScope(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          void askAi();
          return;
        }
        const target = results[activeIndex];
        if (target) {
          e.preventDefault();
          openResult(target);
        }
      }
    },
    [activeIndex, askAi, cycleScope, onClose, openResult, results],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-zinc-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl"
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-zinc-100 p-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PRs, mentions, meetings… (Cmd+Enter to ask AI)"
            aria-label="Search Signals"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
        </div>

        <nav
          aria-label="Scopes"
          className="flex gap-1.5 border-b border-zinc-100 px-3 py-2"
        >
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!s.enabled}
              aria-pressed={scope === s.id}
              onClick={() => s.enabled && setScope(s.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                scope === s.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                !s.enabled && "cursor-not-allowed opacity-50",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <ResultsList
          results={results}
          activeIndex={activeIndex}
          onActivate={setActiveIndex}
          onOpen={openResult}
        />

        {answer.kind !== "idle" && (
          <AnswerPanel
            state={answer}
            onDismiss={() => setAnswer({ kind: "idle" })}
          />
        )}

        <footer className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          <span>↑↓ navigate · ↵ open · Tab scope · Esc close</span>
          <button
            type="button"
            onClick={() => void askAi()}
            disabled={!query.trim() || answer.kind === "loading"}
            className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            Ask AI
          </button>
        </footer>
      </div>
    </div>
  );
}

function ResultsList({
  results,
  activeIndex,
  onActivate,
  onOpen,
}: {
  results: Result[];
  activeIndex: number;
  onActivate: (i: number) => void;
  onOpen: (r: Result) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-zinc-500">
        No matches yet. Try a different query.
      </p>
    );
  }
  return (
    <ul aria-label="Results" className="max-h-80 overflow-y-auto py-1">
      {results.map((r, i) => (
        <li key={r.id}>
          <button
            type="button"
            data-active={i === activeIndex}
            onMouseEnter={() => onActivate(i)}
            onClick={() => onOpen(r)}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
              i === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50",
            )}
          >
            <ProviderBadge provider={r.provider} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-zinc-900">
                {r.title}
              </div>
              <div className="truncate text-xs text-zinc-500">
                {[kindLabel(r.kind), secondaryLabel(r)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {r.url && <ExternalLink className="h-3 w-3 text-zinc-400" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AnswerPanel({
  state,
  onDismiss,
}: {
  state: AnswerState;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="AI answer"
      className="border-t border-zinc-100 bg-zinc-50 px-3 py-3 text-sm text-zinc-800"
    >
      <header className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Ask AI
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1 text-zinc-400 hover:text-zinc-700"
        >
          Hide
        </button>
      </header>
      {state.kind === "loading" && <p className="text-zinc-500">Thinking…</p>}
      {state.kind === "result" && state.result.ok && (
        <>
          <p className="whitespace-pre-line">{state.result.answer}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {state.result.provider} · {state.result.model}
            {state.result.used_fallback && " · running on fallback model"}
          </p>
        </>
      )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "no_provider" && (
          <p className="text-zinc-600">
            No AI provider configured.{" "}
            <a href="/settings" className="underline hover:text-zinc-900">
              Set one in Settings
            </a>
            .
          </p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "disabled" && (
          <p className="text-zinc-600">AI is disabled for this account.</p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "budget_reached" && (
          <p className="text-zinc-600">AI disabled — monthly budget reached.</p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "error" && (
          <p className="text-red-700">
            Couldn't ask AI{state.result.error ? `: ${state.result.error}` : ""}
            .
          </p>
        )}
    </section>
  );
}

function ProviderBadge({ provider }: { provider: SignalProvider }) {
  const Icon =
    provider === "github"
      ? Github
      : provider === "slack"
        ? Slack
        : provider === "linear"
          ? SquareKanban
          : provider === "jira"
            ? Trello
            : CalIcon;
  return (
    <span
      role="img"
      aria-label={`Source: ${provider}`}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-700"
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function secondaryLabel(s: Result): string {
  if (s.provider === "slack") {
    const channelType = s.payload?.channel_type as string | undefined;
    const channel = s.payload?.channel as string | undefined;
    if (channelType === "im") return "DM";
    return channel ? `#${channel}` : "";
  }
  if (s.kind === "meeting") {
    const startsAt = s.payload?.starts_at as string | undefined;
    if (!startsAt) return "";
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (s.provider === "linear" || s.provider === "jira") {
    const identifier =
      (s.payload?.identifier as string | undefined) ?? s.source_id;
    const stateName = (s.payload?.state_name as string | undefined) ?? "";
    return [identifier, stateName].filter(Boolean).join(" · ");
  }
  const repo = (s.payload?.repo as string | undefined) ?? "";
  return repo;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "pr_review_requested":
      return "Review requested";
    case "pr_authored":
      return "Authored PR";
    case "pr_assigned":
      return "Assigned PR";
    case "meeting":
      return "Meeting";
    case "dm":
      return "Direct message";
    case "mention":
      return "Mention";
    case "thread_reply":
      return "Thread reply";
    case "ticket_assigned":
      return "Todo";
    case "ticket_in_progress":
      return "In progress";
    case "ticket_in_review":
      return "In review";
    case "ticket_blocked":
      return "Blocked";
    default:
      return kind;
  }
}
