// Cmd-K command palette. Opens via Cmd/Ctrl-K or the `devy:open-cmdk` event.
// Searches across Signals; renders results grouped by source (PRs / Tickets /
// Meetings / Slack) over shadcn `Dialog` + `Command` (cmdk). Footer carries an
// "Ask AI" affordance with the typed query and the provider chip.

import { CornerDownLeft, Sparkles } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SourceGlyph, type SourceKind } from "#/components/SourceGlyph";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "#/components/ui/dialog";
import { apiFetch } from "#/lib/api-client";
import type { AskAiResult } from "#/lib/ask-ai-api";
import { cn } from "#/lib/cn";
import type { Signal } from "#/lib/signal";

const OPEN_CMDK_EVENT = "devy:open-cmdk";

const PROVIDER_LABEL = "HAIKU 4.5";

export type Result = Signal & { id: string };

export type Searcher = (query: string) => Promise<{ signals: Result[] }>;

export type Asker = (q: string, signalIds: string[]) => Promise<AskAiResult>;

const defaultSearcher: Searcher = async (query) => {
  const params = new URLSearchParams({ filter: "all", limit: "20" });
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

type GroupId = "prs" | "tickets" | "meetings" | "slack";

type GroupDef = {
  id: GroupId;
  heading: string;
  glyph: SourceKind;
};

const GROUPS: GroupDef[] = [
  { id: "prs", heading: "PRs", glyph: "git" },
  { id: "tickets", heading: "Tickets", glyph: "task" },
  { id: "meetings", heading: "Meetings", glyph: "cal" },
  { id: "slack", heading: "Slack", glyph: "slack" },
];

function groupOf(s: Signal): GroupId | null {
  if (s.kind === "meeting") return "meetings";
  if (s.provider === "slack") return "slack";
  if (s.provider === "github" && s.kind.startsWith("pr_")) return "prs";
  if (s.provider === "linear" || s.provider === "jira") return "tickets";
  if (s.kind.startsWith("ticket_")) return "tickets";
  return null;
}

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
        setOpen((v) => {
          if (v) return false;
          // Don't steal focus from an already-open modal (e.g. Focus session dialog).
          if (document.querySelector('[role="dialog"]')) return false;
          return true;
        });
      }
    }
    function onOpenEvent() {
      if (document.querySelector('[role="dialog"]')) return;
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_CMDK_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_CMDK_EVENT, onOpenEvent);
    };
  }, []);

  return (
    <PaletteDialog
      open={open}
      onOpenChange={setOpen}
      searcher={searcher ?? defaultSearcher}
      asker={asker ?? defaultAsker}
    />
  );
}

type AnswerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; result: AskAiResult };

function PaletteDialog({
  open,
  onOpenChange,
  searcher,
  asker,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  searcher: Searcher;
  asker: Asker;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [answer, setAnswer] = useState<AnswerState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient state when re-opening so a previous session doesn't leak.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setAnswer({ kind: "idle" });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searcher(query)
        .then((body) => {
          if (cancelled) return;
          setResults(body.signals);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, searcher]);

  const grouped = useMemo(() => {
    const buckets: Record<GroupId, Result[]> = {
      prs: [],
      tickets: [],
      meetings: [],
      slack: [],
    };
    for (const r of results) {
      const g = groupOf(r);
      if (g) buckets[g].push(r);
    }
    return buckets;
  }, [results]);

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
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const onCommandKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        // Intercept ⌘↵ so cmdk's own Enter handler — which would dispatch
        // an onSelect on the active item — doesn't also run. Stopping
        // immediate propagation belt-and-braces against bubble paths.
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        void askAi();
      }
    },
    [askAi],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden p-0 sm:max-w-[640px]"
        aria-label="Command palette"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search PRs, tickets, meetings, and Slack signals.
        </DialogDescription>
        <Command
          shouldFilter={false}
          onKeyDown={onCommandKeyDown}
          className="bg-popover"
        >
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search PRs, tickets, meetings, Slack…"
            aria-label="Search Signals"
          />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No matches yet. Try a different query.</CommandEmpty>
            {GROUPS.map((g) => {
              const items = grouped[g.id];
              if (items.length === 0) return null;
              return (
                <CommandGroup key={g.id} heading={g.heading}>
                  {items.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`${g.id}:${r.id}:${r.title}`}
                      onSelect={() => openResult(r)}
                      className="gap-3"
                    >
                      <SourceGlyph source={g.glyph} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {r.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {secondaryLabel(r)}
                        </div>
                      </div>
                      <CornerDownLeft
                        aria-hidden
                        className="size-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 data-[selected=true]:opacity-100"
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
          {answer.kind !== "idle" && (
            <AnswerPanel
              state={answer}
              onDismiss={() => setAnswer({ kind: "idle" })}
            />
          )}
          <AskAiFooter
            query={query}
            disabled={!query.trim() || answer.kind === "loading"}
            onAsk={() => void askAi()}
          />
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AskAiFooter({
  query,
  disabled,
  onAsk,
}: {
  query: string;
  disabled: boolean;
  onAsk: () => void;
}) {
  return (
    <section
      aria-label="Ask AI"
      className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <Sparkles aria-hidden className="size-3.5 text-foreground" />
      <span className="text-foreground">Ask AI</span>
      <span className="truncate">
        {query.trim() ? query : "Type a question and press ⌘↵"}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-foreground">
          ⌘↵
        </kbd>
        <span
          data-slot="ai-provider"
          className={cn(
            "rounded-full border bg-background px-2 py-0.5 font-mono text-[10px] tracking-wider text-foreground",
          )}
        >
          {PROVIDER_LABEL}
        </span>
        <button
          type="button"
          onClick={onAsk}
          disabled={disabled}
          className="rounded-md border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-accent disabled:opacity-50"
        >
          Ask
        </button>
      </span>
    </section>
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
      className="border-t bg-muted/40 px-3 py-3 text-sm text-foreground"
    >
      <header className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="size-3" />
          Ask AI
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1 text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </header>
      {state.kind === "loading" && (
        <p className="text-muted-foreground">Thinking…</p>
      )}
      {state.kind === "result" && state.result.ok && (
        <>
          <p className="whitespace-pre-line">{state.result.answer}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {state.result.provider} · {state.result.model}
            {state.result.used_fallback && " · running on fallback model"}
          </p>
        </>
      )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "no_provider" && (
          <p className="text-muted-foreground">
            No AI provider configured.{" "}
            <a href="/settings" className="underline hover:text-foreground">
              Set one in Settings
            </a>
            .
          </p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "disabled" && (
          <p className="text-muted-foreground">
            AI is disabled for this account.
          </p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "budget_reached" && (
          <p className="text-muted-foreground">
            AI disabled — monthly budget reached.
          </p>
        )}
      {state.kind === "result" &&
        !state.result.ok &&
        state.result.reason === "error" && (
          <p className="text-destructive">
            Couldn't ask AI{state.result.error ? `: ${state.result.error}` : ""}
            .
          </p>
        )}
    </section>
  );
}

function secondaryLabel(s: Result): string {
  const kind = kindLabel(s.kind);
  if (s.provider === "slack") {
    const channelType = s.payload?.channel_type as string | undefined;
    const channel = s.payload?.channel as string | undefined;
    const where = channelType === "im" ? "DM" : channel ? `#${channel}` : "";
    return [kind, where].filter(Boolean).join(" · ");
  }
  if (s.kind === "meeting") {
    const startsAt = s.payload?.starts_at as string | undefined;
    if (!startsAt) return kind;
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return kind;
    return `${kind} · ${d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (s.provider === "linear" || s.provider === "jira") {
    const identifier =
      (s.payload?.identifier as string | undefined) ?? s.source_id;
    const stateName = (s.payload?.state_name as string | undefined) ?? "";
    return [kind, identifier, stateName].filter(Boolean).join(" · ");
  }
  const repo = (s.payload?.repo as string | undefined) ?? "";
  return [kind, repo].filter(Boolean).join(" · ");
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
