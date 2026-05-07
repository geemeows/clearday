import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/coss/dialog";
import type { AlertChannel } from "#/features/alerts/dispatcher";
import { ACTION_LIST, ACTIONS } from "#/features/automations/actions";
import {
  type Automation,
  type AutomationAction,
  type AutomationPredicate,
  bucketAutomations,
  bucketRunsByDay,
  cronExpressionValid,
  humanizeCron,
  previewAutomations,
  type RunsHistogramDay,
} from "#/features/automations/engine";
import {
  AUTOMATION_TEMPLATES,
  type AutomationTemplate,
} from "#/features/automations/templates";
import { TRIGGER_LIST, TRIGGERS } from "#/features/automations/triggers";
import type { AutomationRunRow } from "#/features/automations/api";
import { apiFetch } from "#/lib/api-client";
import type { StoredSignal } from "#/shared/signal";

type RunsLoader = (automationId: string) => Promise<{
  runs: AutomationRunRow[];
}>;

const defaultRunsLoader: RunsLoader = async (automationId) => {
  const body = (await apiFetch(
    `/api/automations/${encodeURIComponent(automationId)}/runs`,
  )) as { ok: boolean; runs: AutomationRunRow[] };
  return { runs: body.runs ?? [] };
};

type DryRunInvoker = (automationId: string) => Promise<
  | { ok: true; status: string; trigger_event_id: string }
  | { ok: false; error: string }
>;

const defaultDryRunInvoker: DryRunInvoker = async (automationId) => {
  return (await apiFetch(
    `/api/automations/${encodeURIComponent(automationId)}/dry-run`,
    { method: "POST" },
  )) as Awaited<ReturnType<DryRunInvoker>>;
};

// ---------------------------------------------------------------------------
// Automations panel — list view + builder modal. Renders the user's
// automations with an enable/disable toggle per row and a "New automation"
// button that opens the builder modal. The builder edits trigger, predicates,
// and a fan-out action list.
//
// The CRUD API replaces the entire list on every save (matching
// /api/automations); the panel sends the full set on each persist.
// ---------------------------------------------------------------------------

const PREDICATE_TYPES: Array<{
  id: AutomationPredicate["type"];
  label: string;
}> = [
  { id: "provider", label: "Provider is" },
  { id: "kind", label: "Kind is" },
  { id: "source_match", label: "Payload field equals" },
  { id: "title_regex", label: "Title matches regex" },
  { id: "state_from_to", label: "State change from / to" },
];

const ALERT_CHANNEL_OPTIONS: Array<{ id: AlertChannel; label: string }> = [
  { id: "slack_dm", label: "Slack DM" },
  { id: "web_push", label: "Web Push" },
  { id: "email", label: "Email" },
  { id: "desktop", label: "Desktop" },
];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `automation-${Math.random().toString(36).slice(2)}`;
}

function emptyAutomation(): Automation {
  return {
    id: newId(),
    name: "New automation",
    enabled: true,
    priority: 100,
    trigger_kind: "signal_ingested",
    predicates: [{ type: "kind", kind: "mention" }],
    actions: [{ type: "tag", tag: "" }],
  };
}

function defaultPredicate(
  type: AutomationPredicate["type"],
): AutomationPredicate {
  switch (type) {
    case "provider":
      return { type: "provider", provider: "github" };
    case "kind":
      return { type: "kind", kind: "mention" };
    case "source_match":
      return { type: "source_match", field: "author", equals: "" };
    case "title_regex":
      return { type: "title_regex", pattern: "" };
    case "state_from_to":
      return { type: "state_from_to", field: "state", from: "", to: "" };
  }
}

function defaultAction(type: AutomationAction["type"]): AutomationAction {
  switch (type) {
    case "dismiss":
      return { type: "dismiss" };
    case "snooze":
      return { type: "snooze", minutes: 60 };
    case "tag":
      return { type: "tag", tag: "" };
    case "set_priority":
      return { type: "set_priority", value: "high" };
    case "set_channels":
      return { type: "set_channels", channels: ["slack_dm"] };
    case "transition_ticket":
      return { type: "transition_ticket", to_status: "Done" };
    case "set_focus":
      return { type: "set_focus", duration_minutes: 25 };
    case "post_message":
      return { type: "post_message", target: "self_dm", body: "" };
    case "comment_on_pr":
      return { type: "comment_on_pr", body: "" };
    case "request_reviewers":
      return { type: "request_reviewers", reviewers: [] };
  }
}

type SignalsLoader = () => Promise<StoredSignal[]>;

const defaultSignalsLoader: SignalsLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=all")) as {
    signals: StoredSignal[];
  };
  return body.signals;
};

export function AutomationsPanel({
  loader,
  saver,
  signalsLoader = defaultSignalsLoader,
  runsLoader = defaultRunsLoader,
  dryRunInvoker = defaultDryRunInvoker,
  q: qProp,
  onQChange,
  demo = false,
}: {
  loader?: () => Promise<{ automations: Automation[] }>;
  saver?: (automations: Automation[]) => Promise<{
    ok: boolean;
    automations?: Automation[];
    error?: string;
  }>;
  signalsLoader?: SignalsLoader;
  runsLoader?: RunsLoader;
  dryRunInvoker?: DryRunInvoker;
  q?: string;
  onQChange?: (q: string) => void;
  /**
   * Design-fixture switch wired to `?demo=1`. When true, renders an "Empty
   * state preview" toggle in the header that swaps the populated list for the
   * first-run empty state without touching data. Invisible to real users.
   */
  demo?: boolean;
} = {}) {
  const [qLocal, setQLocal] = useState("");
  const q = qProp ?? qLocal;
  const setQ = useCallback(
    (next: string) => {
      if (onQChange) onQChange(next);
      else setQLocal(next);
    },
    [onQChange],
  );
  const [showEmptyPreview, setShowEmptyPreview] = useState(false);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewSignals, setPreviewSignals] = useState<StoredSignal[] | null>(
    null,
  );
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const load = useMemo(
    () =>
      loader ??
      (() =>
        apiFetch("/api/automations") as Promise<{
          automations: Automation[];
        }>),
    [loader],
  );
  const save = useMemo(
    () =>
      saver ??
      ((next: Automation[]) =>
        apiFetch("/api/automations", {
          method: "PUT",
          body: { automations: next },
        }) as Promise<{
          ok: boolean;
          automations?: Automation[];
          error?: string;
        }>),
    [saver],
  );

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => {
        if (cancelled) return;
        setAutomations(body.automations);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    signalsLoader()
      .then((list) => {
        if (cancelled) return;
        setPreviewSignals(list);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewSignals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [signalsLoader]);

  const persist = useCallback(
    async (next: Automation[]) => {
      setAutomations(next);
      setBusy(true);
      try {
        const out = await save(next);
        if (!out.ok) {
          setError(out.error ?? "save failed");
        } else {
          if (out.automations) setAutomations(out.automations);
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

  const openNew = useCallback(() => {
    setEditing(emptyAutomation());
    setBuilderOpen(true);
  }, []);

  const openTemplates = useCallback(() => {
    setTemplatesOpen(true);
  }, []);

  const closeTemplates = useCallback(() => {
    setTemplatesOpen(false);
  }, []);

  const useTemplate = useCallback((tpl: AutomationTemplate) => {
    setEditing({ ...tpl.automation, id: newId() });
    setBuilderOpen(true);
    setTemplatesOpen(false);
  }, []);

  const openEdit = useCallback((a: Automation) => {
    setEditing({ ...a });
    setBuilderOpen(true);
  }, []);

  const closeBuilder = useCallback(() => {
    setBuilderOpen(false);
    setEditing(null);
  }, []);

  const onBuilderSave = useCallback(
    async (next: Automation) => {
      const list = automations ?? [];
      const exists = list.some((a) => a.id === next.id);
      const merged = exists
        ? list.map((a) => (a.id === next.id ? next : a))
        : [...list, next];
      closeBuilder();
      await persist(merged);
    },
    [automations, closeBuilder, persist],
  );

  const onToggle = useCallback(
    (id: string, enabled: boolean) => {
      if (!automations) return;
      persist(automations.map((a) => (a.id === id ? { ...a, enabled } : a)));
    },
    [automations, persist],
  );

  const [runsAutomation, setRunsAutomation] = useState<Automation | null>(null);
  const [runs, setRuns] = useState<AutomationRunRow[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunMessage, setDryRunMessage] = useState<string | null>(null);

  const loadRuns = useCallback(
    (id: string) => {
      runsLoader(id)
        .then((body) => {
          setRuns(body.runs);
        })
        .catch((e) => {
          setRunsError(e instanceof Error ? e.message : "failed to load runs");
        });
    },
    [runsLoader],
  );

  const openRuns = useCallback(
    (a: Automation) => {
      setRunsAutomation(a);
      setRuns(null);
      setRunsError(null);
      setDryRunMessage(null);
      loadRuns(a.id);
    },
    [loadRuns],
  );

  const closeRuns = useCallback(() => {
    setRunsAutomation(null);
    setRuns(null);
    setRunsError(null);
    setDryRunMessage(null);
  }, []);

  const triggerDryRun = useCallback(async () => {
    if (!runsAutomation) return;
    const id = runsAutomation.id;
    setDryRunBusy(true);
    setDryRunMessage(null);
    try {
      const out = await dryRunInvoker(id);
      if (!out.ok) {
        setDryRunMessage(`Dry-run failed: ${out.error}`);
      } else {
        setDryRunMessage(`Dry-run ${out.status}`);
        setRuns(null);
        loadRuns(id);
      }
    } catch (e) {
      setDryRunMessage(
        `Dry-run failed: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setDryRunBusy(false);
    }
  }, [runsAutomation, dryRunInvoker, loadRuns]);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete = useMemo(
    () => automations?.find((a) => a.id === pendingDeleteId) ?? null,
    [automations, pendingDeleteId],
  );

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!automations || !pendingDeleteId) return;
    const next = automations.filter((a) => a.id !== pendingDeleteId);
    setPendingDeleteId(null);
    persist(next);
  }, [automations, pendingDeleteId, persist]);

  const filtered = useMemo(() => {
    if (!automations) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return automations;
    return automations.filter((a) => a.name.toLowerCase().includes(needle));
  }, [automations, q]);

  const buckets = useMemo(
    () => (automations ? bucketAutomations(automations) : null),
    [automations],
  );

  return (
    <section aria-label="Automations" className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="font-semibold text-2xl tracking-tight">Automations</h2>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Trigger → predicates → actions, evaluated when a Signal lands.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {demo && (
            <button
              type="button"
              aria-label="Toggle empty state preview"
              aria-pressed={showEmptyPreview}
              onClick={() => setShowEmptyPreview((v) => !v)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              {showEmptyPreview ? "Show populated" : "Show empty state"}
            </button>
          )}
          <button
            type="button"
            onClick={openNew}
            disabled={busy || automations === null}
            className="rounded-md border border-border bg-primary px-3 py-1.5 text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
          >
            New automation
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      {automations == null && !error && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {automations && demo && showEmptyPreview && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3">
          <EmptyState
            busy={busy}
            onNew={openNew}
            onBrowseTemplates={openTemplates}
          />
        </div>
      )}

      {automations && !(demo && showEmptyPreview) && (
        <>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Search automations"
              placeholder="Search automations…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background py-1 pr-3 pl-8 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            />
          </div>
          {buckets && automations.length > 0 && (
            <p
              aria-label="Automations summary"
              className="font-mono text-[11px] text-muted-foreground"
            >
              {buckets.active} active · {buckets.paused} paused ·{" "}
              {buckets.dryRun} dry-run
            </p>
          )}
          <div className="space-y-3 rounded-lg border border-border bg-card p-3">
            {automations.length === 0 && (
              <EmptyState
                busy={busy}
                onNew={openNew}
                onBrowseTemplates={openTemplates}
              />
            )}
            {automations.length > 0 && filtered.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No matches for “{q}”
              </p>
            )}
            {filtered.map((a) => (
              <AutomationRow
                key={a.id}
                automation={a}
                busy={busy}
                onToggle={(enabled) => onToggle(a.id, enabled)}
                onEdit={() => openEdit(a)}
                onDelete={() => requestDelete(a.id)}
                onViewRuns={() => openRuns(a)}
              />
            ))}
          </div>
        </>
      )}

      {automations && previewSignals && (
        <AutomationsPreview
          automations={automations}
          signals={previewSignals}
        />
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete automation</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Delete <span className="font-medium">{pendingDelete?.name}</span>?
            This also purges its run history. This cannot be undone.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={cancelDelete}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              aria-label="Confirm delete automation"
              onClick={confirmDelete}
              className="rounded border border-destructive/40 bg-destructive px-3 py-1.5 text-destructive-foreground text-sm hover:opacity-90"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing && automations?.some((a) => a.id === editing.id)
                ? "Edit automation"
                : "New automation"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <AutomationBuilder
              automation={editing}
              onChange={setEditing}
              signals={previewSignals ?? []}
            />
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={closeBuilder}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!editing}
              onClick={() => editing && onBuilderSave(editing)}
              className="rounded border border-border bg-primary px-3 py-1.5 text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={runsAutomation !== null}
        onOpenChange={(open) => {
          if (!open) closeRuns();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Runs · {runsAutomation?.name ?? ""}
            </DialogTitle>
          </DialogHeader>
          {runs && runs.length > 0 && <RunsHistogram runs={runs} />}
          <RunsList runs={runs} error={runsError} />
          {dryRunMessage && (
            <p
              aria-label="Dry-run result"
              className="rounded border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground"
            >
              {dryRunMessage}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              aria-label="Test automation in dry-run mode"
              onClick={triggerDryRun}
              disabled={dryRunBusy}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {dryRunBusy ? "Running…" : "Test (dry-run)"}
            </button>
            <button
              type="button"
              onClick={closeRuns}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse templates</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">
            Pick a template to seed a new automation. You can edit it before
            saving — cancelling leaves no row behind.
          </p>
          <ul aria-label="Automation templates" className="space-y-2">
            {AUTOMATION_TEMPLATES.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onUse={() => useTemplate(tpl)}
              />
            ))}
          </ul>
          <DialogFooter>
            <button
              type="button"
              onClick={closeTemplates}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EmptyState({
  busy,
  onNew,
  onBrowseTemplates,
}: {
  busy: boolean;
  onNew: () => void;
  onBrowseTemplates: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        No automations yet. Create one to start shaping incoming Signals.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className="rounded-md border border-border bg-primary px-3 py-1.5 text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
        >
          + New automation
        </button>
        <button
          type="button"
          onClick={onBrowseTemplates}
          disabled={busy}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Browse templates
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onUse,
}: {
  template: AutomationTemplate;
  onUse: () => void;
}) {
  const triggerLabel =
    TRIGGERS[template.automation.trigger_kind]?.label ??
    template.automation.trigger_kind;
  return (
    <li className="flex items-start gap-3 rounded border border-border bg-background p-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium text-sm">{template.automation.name}</p>
        <p className="text-muted-foreground text-xs">{template.description}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {triggerLabel}
          </span>
          {template.automation.actions.map((act, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: action chips are presentational; index is stable for this template's static action list
              key={i}
              className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {ACTIONS[act.type]?.label ?? act.type}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label={`Use template ${template.automation.name}`}
        onClick={onUse}
        className="rounded border border-border bg-primary px-2 py-1 text-primary-foreground text-xs hover:opacity-90"
      >
        Use template
      </button>
    </li>
  );
}

function AutomationRow({
  automation,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onViewRuns,
}: {
  automation: Automation;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewRuns: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-background p-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          aria-label={`${automation.name} enabled`}
          checked={automation.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={busy}
        />
        Enabled
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{automation.name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {automation.trigger_kind} · {automation.predicates.length} predicate
          {automation.predicates.length === 1 ? "" : "s"} ·{" "}
          {automation.actions.length} action
          {automation.actions.length === 1 ? "" : "s"}
        </p>
      </div>
      <button
        type="button"
        aria-label={`View runs for ${automation.name}`}
        onClick={onViewRuns}
        disabled={busy}
        className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
      >
        Runs
      </button>
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
      >
        Edit
      </button>
      <button
        type="button"
        aria-label={`Delete ${automation.name}`}
        onClick={onDelete}
        disabled={busy}
        className="rounded border border-destructive/40 bg-background px-2 py-1 text-destructive text-xs hover:bg-destructive/10 disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}

const HISTOGRAM_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatHistogramDate(date: string): string {
  return HISTOGRAM_DATE_FMT.format(new Date(`${date}T00:00:00Z`));
}

function tooltipText(d: RunsHistogramDay): string {
  return `${formatHistogramDate(d.date)} · ${d.succeeded} succeeded · ${d.failed} failed · ${d.skipped_dry_run} dry-run`;
}

function RunsHistogram({ runs }: { runs: AutomationRunRow[] }) {
  const days = useMemo(() => bucketRunsByDay(runs, new Date()), [runs]);
  const max = useMemo(
    () =>
      days.reduce(
        (m, d) => Math.max(m, d.succeeded + d.failed + d.skipped_dry_run),
        0,
      ),
    [days],
  );
  return (
    <div
      aria-label="Runs histogram (14-day)"
      className="rounded border border-border bg-muted/40 p-2"
    >
      <div className="flex h-16 items-end gap-1">
        {days.map((d) => {
          const total = d.succeeded + d.failed + d.skipped_dry_run;
          const heightPct = max > 0 ? (total / max) * 100 : 0;
          const tooltip = tooltipText(d);
          return (
            <div
              key={d.date}
              aria-label={tooltip}
              title={tooltip}
              className="relative flex h-full flex-1 items-end"
            >
              {total > 0 && (
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: `${heightPct}%` }}
                >
                  {d.succeeded > 0 && (
                    <div
                      data-segment="succeeded"
                      style={{
                        flex: d.succeeded,
                        background: "var(--good)",
                      }}
                    />
                  )}
                  {d.failed > 0 && (
                    <div
                      data-segment="failed"
                      style={{
                        flex: d.failed,
                        background: "var(--destructive)",
                      }}
                    />
                  )}
                  {d.skipped_dry_run > 0 && (
                    <div
                      data-segment="skipped_dry_run"
                      style={{
                        flex: d.skipped_dry_run,
                        background: "var(--warn)",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {days.map((d) => (
          <span
            key={d.date}
            className="flex-1 text-center font-mono text-[9px] text-muted-foreground"
          >
            {new Date(`${d.date}T00:00:00Z`).getUTCDate()}
          </span>
        ))}
      </div>
    </div>
  );
}

function RunsList({
  runs,
  error,
}: {
  runs: AutomationRunRow[] | null;
  error: string | null;
}) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
      >
        {error}
      </p>
    );
  }
  if (runs === null) {
    return <p className="text-muted-foreground text-sm">Loading runs…</p>;
  }
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No runs yet. Runs land here as soon as the automation fires.
      </p>
    );
  }
  return (
    <ul aria-label="Automation runs" className="space-y-2">
      {runs.map((r) => (
        <li
          key={r.id}
          className="rounded border border-border bg-muted/40 p-2 text-xs"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {r.started_at}
            </span>
            <span
              aria-label="Run status"
              className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
            >
              {r.status}
            </span>
          </div>
          <div className="mt-1 text-muted-foreground">
            Signal: {r.signal_id ?? "—"} · planned {r.actions_planned.length} ·
            executed {r.actions_executed.length}
          </div>
          {r.error && (
            <p className="mt-1 text-destructive">{r.error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function AutomationsPreview({
  automations,
  signals,
}: {
  automations: Automation[];
  signals: StoredSignal[];
}) {
  const matches = useMemo(
    () => previewAutomations(signals, automations),
    [automations, signals],
  );
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of automations) map.set(a.id, a.name || "Unnamed");
    return map;
  }, [automations]);

  return (
    <section
      aria-label="Automations preview"
      className="border-t border-border pt-4"
    >
      <h3 className="font-semibold text-sm">Preview against recent Signals</h3>
      <p className="mt-1 text-muted-foreground text-xs">
        {matches.length} of {signals.length} recent Signals would be affected.
      </p>
      {matches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {matches.slice(0, 10).map(({ signal, application }) => (
            <li
              key={`${signal.provider}:${signal.kind}:${signal.source_id}`}
              className="rounded border border-border bg-muted/40 p-2 text-xs"
            >
              <div className="font-medium">{signal.title}</div>
              <div className="mt-0.5 text-muted-foreground">
                {application.matched_automation_ids
                  .map((id) => names.get(id) ?? id)
                  .join(", ")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AutomationBuilder({
  automation,
  onChange,
  signals,
}: {
  automation: Automation;
  onChange: (next: Automation) => void;
  signals: StoredSignal[];
}) {
  const set = (patch: Partial<Automation>) =>
    onChange({ ...automation, ...patch });

  return (
    <div className="space-y-4 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Name</span>
        <input
          type="text"
          aria-label="Automation name"
          value={automation.name}
          onChange={(e) => set({ name: e.target.value })}
          className="rounded border border-border bg-background px-2 py-1"
        />
      </label>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          aria-label="Dry-run mode"
          checked={automation.dry_run === true}
          onChange={(e) => set({ dry_run: e.target.checked })}
          className="mt-0.5"
        />
        <span className="flex flex-col">
          <span className="text-sm">Dry-run mode</span>
          <span className="text-xs text-muted-foreground">
            Plan actions but suppress side effects; runs land as
            skipped_dry_run.
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Trigger</span>
        <select
          aria-label="Trigger kind"
          value={automation.trigger_kind}
          onChange={(e) => {
            const next = e.target.value as Automation["trigger_kind"];
            set({
              trigger_kind: next,
              trigger_config:
                next === "schedule"
                  ? { cron: automation.trigger_config?.cron ?? "0 9 * * 1-5" }
                  : undefined,
            });
          }}
          className="rounded border border-border bg-background px-2 py-1"
        >
          {TRIGGER_LIST.map((t) => (
            <option key={t.kind} value={t.kind}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {automation.trigger_kind === "schedule" && (
        <ScheduleConfigEditor
          cron={automation.trigger_config?.cron ?? ""}
          onChange={(cron) => set({ trigger_config: { cron } })}
        />
      )}

      <fieldset className="space-y-2 rounded border border-border p-3">
        <legend className="px-1 text-xs text-muted-foreground">When</legend>
        {automation.predicates.map((p, i) => (
          <PredicateEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: predicates list is locally edited; index is stable enough for inputs
            key={i}
            predicate={p}
            onChange={(next) => {
              const arr = [...automation.predicates];
              arr[i] = next;
              set({ predicates: arr });
            }}
            onDelete={() => {
              const arr = automation.predicates.filter((_, j) => j !== i);
              set({ predicates: arr });
            }}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            set({
              predicates: [...automation.predicates, defaultPredicate("kind")],
            })
          }
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          Add predicate
        </button>
      </fieldset>

      <fieldset className="space-y-2 rounded border border-border p-3">
        <legend className="px-1 text-xs text-muted-foreground">Then</legend>
        {automation.actions.map((a, i) => (
          <ActionEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: actions list is locally edited; index is stable enough for inputs
            key={i}
            action={a}
            onChange={(next) => {
              const arr = [...automation.actions];
              arr[i] = next;
              set({ actions: arr });
            }}
            onDelete={() => {
              const arr = automation.actions.filter((_, j) => j !== i);
              set({ actions: arr });
            }}
          />
        ))}
        <button
          type="button"
          onClick={() =>
            set({ actions: [...automation.actions, defaultAction("tag")] })
          }
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          Add action
        </button>
      </fieldset>

      <BuilderPreview automation={automation} signals={signals} />
    </div>
  );
}

function BuilderPreview({
  automation,
  signals,
}: {
  automation: Automation;
  signals: StoredSignal[];
}) {
  const matches = useMemo(
    () => previewAutomations(signals, [automation]),
    [automation, signals],
  );
  return (
    <section
      aria-label="Builder live preview"
      className="space-y-2 rounded border border-border bg-muted/40 p-3"
    >
      <h4 className="font-semibold text-xs">Live preview</h4>
      <p className="font-mono text-[11px] text-muted-foreground">
        {matches.length} of {signals.length} recent Signals match these
        predicates.
      </p>
      {matches.length > 0 && (
        <ul className="space-y-1.5">
          {matches.slice(0, 5).map(({ signal }) => (
            <li
              key={`${signal.provider}:${signal.kind}:${signal.source_id}`}
              className="truncate rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {signal.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScheduleConfigEditor({
  cron,
  onChange,
}: {
  cron: string;
  onChange: (cron: string) => void;
}) {
  const trimmed = cron.trim();
  const valid = trimmed.length > 0 && cronExpressionValid(trimmed);
  return (
    <fieldset className="space-y-2 rounded border border-border p-3">
      <legend className="px-1 text-xs text-muted-foreground">Schedule</legend>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          Cron expression (UTC, minute granularity)
        </span>
        <input
          type="text"
          aria-label="Cron expression"
          value={cron}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0 9 * * 1-5"
          className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        />
      </label>
      <p
        aria-live="polite"
        className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}
      >
        {valid
          ? humanizeCron(trimmed)
          : trimmed.length === 0
            ? "Enter a 5-field cron expression"
            : "Invalid cron expression"}
      </p>
    </fieldset>
  );
}

function PredicateEditor({
  predicate,
  onChange,
  onDelete,
}: {
  predicate: AutomationPredicate;
  onChange: (next: AutomationPredicate) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2 rounded border border-border bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Predicate type"
          value={predicate.type}
          onChange={(e) =>
            onChange(
              defaultPredicate(e.target.value as AutomationPredicate["type"]),
            )
          }
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
        >
          {PREDICATE_TYPES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Delete predicate"
          onClick={onDelete}
          className="rounded border border-destructive/30 px-2 py-1 text-destructive text-xs"
        >
          Delete
        </button>
      </div>
      <PredicateInputs predicate={predicate} onChange={onChange} />
    </div>
  );
}

function PredicateInputs({
  predicate,
  onChange,
}: {
  predicate: AutomationPredicate;
  onChange: (p: AutomationPredicate) => void;
}) {
  if (predicate.type === "provider") {
    return (
      <input
        type="text"
        aria-label="Provider value"
        value={predicate.provider}
        onChange={(e) => onChange({ ...predicate, provider: e.target.value })}
        placeholder="github / slack / google"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
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
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      />
    );
  }
  if (predicate.type === "source_match") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          aria-label="Payload field"
          value={predicate.field}
          onChange={(e) => onChange({ ...predicate, field: e.target.value })}
          placeholder="field"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          type="text"
          aria-label="Payload equals"
          value={predicate.equals}
          onChange={(e) => onChange({ ...predicate, equals: e.target.value })}
          placeholder="equals"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
    );
  }
  if (predicate.type === "state_from_to") {
    return (
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          aria-label="State field"
          value={predicate.field}
          onChange={(e) => onChange({ ...predicate, field: e.target.value })}
          placeholder="field (e.g. merged)"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          type="text"
          aria-label="State from"
          value={predicate.from ?? ""}
          onChange={(e) => onChange({ ...predicate, from: e.target.value })}
          placeholder="from"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          type="text"
          aria-label="State to"
          value={predicate.to ?? ""}
          onChange={(e) => onChange({ ...predicate, to: e.target.value })}
          placeholder="to"
          className="rounded border border-border bg-background px-2 py-1 text-xs"
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
      className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
    />
  );
}

function ActionEditor({
  action,
  onChange,
  onDelete,
}: {
  action: AutomationAction;
  onChange: (next: AutomationAction) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2 rounded border border-border bg-muted/40 p-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Action type"
          value={action.type}
          onChange={(e) =>
            onChange(defaultAction(e.target.value as AutomationAction["type"]))
          }
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
        >
          {ACTION_LIST.map((a) => (
            <option key={a.type} value={a.type}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Delete action"
          onClick={onDelete}
          className="rounded border border-destructive/30 px-2 py-1 text-destructive text-xs"
        >
          Delete
        </button>
      </div>
      <ActionInputs action={action} onChange={onChange} />
    </div>
  );
}

function ActionInputs({
  action,
  onChange,
}: {
  action: AutomationAction;
  onChange: (a: AutomationAction) => void;
}) {
  if (action.type === "dismiss") {
    return (
      <p className="text-muted-foreground text-xs">
        Marks the Signal dismissed on first ingest.
      </p>
    );
  }
  if (action.type === "snooze") {
    return (
      <input
        type="number"
        min={1}
        aria-label="Snooze minutes"
        value={action.minutes}
        onChange={(e) =>
          onChange({ ...action, minutes: Number(e.target.value) || 0 })
        }
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      />
    );
  }
  if (action.type === "tag") {
    return (
      <input
        type="text"
        aria-label="Tag value"
        value={action.tag}
        onChange={(e) => onChange({ ...action, tag: e.target.value })}
        placeholder="tag"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      />
    );
  }
  if (action.type === "transition_ticket") {
    return (
      <div className="space-y-2">
        <p
          role="alert"
          className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-700 text-xs dark:text-amber-400"
        >
          Linear / Jira not yet integrated — this action will record a
          “skipped_no_capability” run until a ticket-tracker provider lands.
        </p>
        <input
          type="text"
          aria-label="Transition to status"
          value={action.to_status}
          onChange={(e) => onChange({ ...action, to_status: e.target.value })}
          placeholder="Done"
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      </div>
    );
  }
  if (action.type === "set_focus") {
    return (
      <input
        type="number"
        min={1}
        aria-label="Focus duration minutes"
        value={action.duration_minutes}
        onChange={(e) =>
          onChange({
            ...action,
            duration_minutes: Number(e.target.value) || 0,
          })
        }
        placeholder="25"
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      />
    );
  }
  if (action.type === "comment_on_pr") {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Posts a top-level comment on the PR. Targets the triggering Signal's
          PR by default; pin a repo + number to target a specific PR.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            aria-label="GitHub repo"
            value={action.repo ?? ""}
            onChange={(e) =>
              onChange({
                ...action,
                repo: e.target.value.length > 0 ? e.target.value : undefined,
              })
            }
            placeholder="owner/repo (optional)"
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
          <input
            type="number"
            min={1}
            aria-label="PR number"
            value={action.number ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({
                ...action,
                number: Number.isInteger(n) && n > 0 ? n : undefined,
              });
            }}
            placeholder="PR # (optional)"
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </div>
        <textarea
          aria-label="PR comment body"
          value={action.body}
          onChange={(e) => onChange({ ...action, body: e.target.value })}
          placeholder="{{signal.title}}"
          rows={3}
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        />
      </div>
    );
  }
  if (action.type === "request_reviewers") {
    const reviewersText = action.reviewers.join(", ");
    const teamsText = (action.team_reviewers ?? []).join(", ");
    const splitCsv = (s: string): string[] =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Re-pings reviewers on the triggering PR. Comma-separate logins / team
          slugs.
        </p>
        <input
          type="text"
          aria-label="Reviewer logins"
          value={reviewersText}
          onChange={(e) =>
            onChange({ ...action, reviewers: splitCsv(e.target.value) })
          }
          placeholder="alice, bob"
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        />
        <input
          type="text"
          aria-label="Team reviewer slugs"
          value={teamsText}
          onChange={(e) => {
            const next = splitCsv(e.target.value);
            onChange({
              ...action,
              team_reviewers: next.length > 0 ? next : undefined,
            });
          }}
          placeholder="platform, infra (optional teams)"
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            aria-label="GitHub repo"
            value={action.repo ?? ""}
            onChange={(e) =>
              onChange({
                ...action,
                repo: e.target.value.length > 0 ? e.target.value : undefined,
              })
            }
            placeholder="owner/repo (optional)"
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
          <input
            type="number"
            min={1}
            aria-label="PR number"
            value={action.number ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange({
                ...action,
                number: Number.isInteger(n) && n > 0 ? n : undefined,
              });
            }}
            placeholder="PR # (optional)"
            className="rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </div>
      </div>
    );
  }
  if (action.type === "post_message") {
    return (
      <div className="space-y-2">
        <select
          aria-label="Slack target"
          value={action.target}
          onChange={(e) =>
            onChange({
              ...action,
              target: e.target.value as
                | "channel"
                | "self_dm"
                | "thread_reply",
            })
          }
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="self_dm">Self DM</option>
          <option value="channel">Channel</option>
          <option value="thread_reply">Reply in thread</option>
        </select>
        {action.target === "channel" && (
          <input
            type="text"
            aria-label="Slack channel"
            value={action.channel ?? ""}
            onChange={(e) => onChange({ ...action, channel: e.target.value })}
            placeholder="#channel"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          />
        )}
        <textarea
          aria-label="Slack message body"
          value={action.body}
          onChange={(e) => onChange({ ...action, body: e.target.value })}
          placeholder="{{signal.title}}"
          rows={3}
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
        />
        <p className="text-muted-foreground text-[10px]">
          Templating: {"{{signal.title}}, {{signal.url}}, {{signal.payload.repo}}"}.
          Missing fields render as empty.
        </p>
      </div>
    );
  }
  if (action.type === "set_priority") {
    return (
      <select
        aria-label="Priority value"
        value={action.value}
        onChange={(e) =>
          onChange({
            ...action,
            value: e.target.value as "low" | "high",
          })
        }
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="high">High</option>
        <option value="low">Low</option>
      </select>
    );
  }
  return (
    <fieldset
      aria-label="Channels value"
      className="flex flex-wrap gap-3 text-xs"
    >
      {ALERT_CHANNEL_OPTIONS.map((c) => {
        const checked = action.channels.includes(c.id);
        return (
          <label key={c.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                const next = checked
                  ? action.channels.filter((x) => x !== c.id)
                  : [...action.channels, c.id];
                onChange({ ...action, channels: next });
              }}
            />
            {c.label}
          </label>
        );
      })}
    </fieldset>
  );
}
