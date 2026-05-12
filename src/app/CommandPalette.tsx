// Cmd-K command palette. Opens via Cmd/Ctrl-K or the `devy:open-cmdk` event.
// Searches across Signals; renders results grouped by source (PRs / Tickets /
// Meetings / Slack) over shadcn `Dialog` + `Command` (cmdk). Footer carries an
// "Ask AI" affordance with the typed query and the provider chip.

import { Sparkles } from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import type { AskAiResult } from "#/features/ask-ai/api";
import { signalKindLabel } from "#/features/integrations/display";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";
import { apiFetch } from "#/lib/api-client";
import { cn } from "#/lib/cn";
import type { Signal } from "#/shared/signal";

const OPEN_CMDK_EVENT = "devy:open-cmdk";

const PROVIDER_LABEL = "HAIKU 4.5";

export type Result = Signal & { id: string };

export type Searcher = (query: string) => Promise<{ signals: Result[] }>;

export type Asker = (q: string, signalIds: string[]) => Promise<AskAiResult>;

export type PaletteCommandGroup = "Navigation" | "Actions";

export type PaletteCommand = {
  id: string;
  label: string;
  group: PaletteCommandGroup;
  icon: ComponentType<{ className?: string }>;
  keywords?: string;
  onSelect: () => void;
};

const COMMAND_GROUPS: PaletteCommandGroup[] = ["Navigation", "Actions"];

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
  commands,
  initialOpen = false,
}: {
  searcher?: Searcher;
  asker?: Asker;
  commands?: PaletteCommand[];
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
      commands={commands ?? []}
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
  commands,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  searcher: Searcher;
  asker: Asker;
  commands: PaletteCommand[];
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

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups: Record<PaletteCommandGroup, PaletteCommand[]> = {
      Navigation: [],
      Actions: [],
    };
    for (const c of commands) {
      if (q) {
        const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      groups[c.group].push(c);
    }
    return groups;
  }, [commands, query]);

  const runCommand = useCallback(
    (c: PaletteCommand) => {
      c.onSelect();
      onOpenChange(false);
    },
    [onOpenChange],
  );

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
        className="overflow-hidden p-0 sm:max-w-[620px]"
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
            trailing={
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                ESC
              </kbd>
            }
          />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No matches yet. Try a different query.</CommandEmpty>
            {COMMAND_GROUPS.map((heading) => {
              const items = filteredCommands[heading];
              if (items.length === 0) return null;
              return (
                <CommandGroup key={heading} heading={heading}>
                  {items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`cmd:${c.id}:${c.label}`}
                      onSelect={() => runCommand(c)}
                      className="gap-3"
                    >
                      <c.icon className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                        {c.label}
                      </div>
                      <span
                        aria-hidden
                        className="text-muted-foreground text-xs tracking-widest"
                      >
                        ↵
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
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
                      <SourceGlyph source={g.glyph} size={16} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] text-foreground">
                          {r.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {secondaryLabel(r)}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        className="text-muted-foreground text-xs tracking-widest"
                      >
                        ↵
                      </span>
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
          <KbdHintsFooter />
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

function FooterKbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border bg-background px-1 font-mono text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function KbdHintsFooter() {
  return (
    <div
      className="flex items-center gap-4 border-t px-4 py-2 text-muted-foreground text-xs"
      style={{ background: "var(--surface-soft)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <FooterKbd>↑</FooterKbd>
        <FooterKbd>↓</FooterKbd>
        <span className="ml-0.5">Navigate</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FooterKbd>↵</FooterKbd>
        <span className="ml-0.5">Open</span>
      </span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        <FooterKbd>esc</FooterKbd>
        <span className="ml-0.5">Close</span>
      </span>
    </div>
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
  const trimmed = query.trim();
  return (
    <section
      aria-label="Ask AI"
      className="flex items-center gap-3 border-t px-4 py-3"
      style={{ background: "var(--src-ai-bg)" }}
    >
      <SourceGlyph source="ai" size={20} />
      <button
        type="button"
        onClick={onAsk}
        disabled={disabled}
        className="min-w-0 flex-1 text-left disabled:opacity-50"
      >
        <div className="truncate text-sm font-semibold text-foreground">
          Ask AI
          {trimmed && (
            <>
              {' "'}
              <span style={{ color: "var(--src-ai)" }}>{trimmed}</span>
              {'"'}
            </>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          Searches across all your signals ·{" "}
          <span data-slot="ai-provider">{PROVIDER_LABEL}</span>
        </div>
      </button>
      <kbd
        className={cn(
          "rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground",
        )}
      >
        ⌘↵
      </kbd>
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
  const kind = signalKindLabel(s.kind);
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
