import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlertChannel } from "#/features/alerts/dispatcher";
import {
  type InboxRule,
  previewInboxRules,
  type RuleEffect,
  type RulePredicate,
} from "#/features/inbox-rules/engine";
import { apiFetch } from "#/lib/api-client";
import type { StoredSignal } from "#/shared/signal";

// ---------------------------------------------------------------------------
// Inbox rules panel (issue #20). Lists user-defined rules with add / delete /
// enable / reorder. Each rule is a single predicate + single effect for v1
// to keep the form-shape simple; the engine itself supports rule lists with
// multiple predicates/effects for future panels.
//
// Deliberately not migrated to useAsyncPanel + <SettingsPanel> (#69 / #82):
// it's a CRUD list with reorder, not a shallow-merge load-and-persist panel.
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
  { id: "priority", label: "Set priority" },
  { id: "channels", label: "Set channels" },
];

const ALERT_CHANNEL_OPTIONS: Array<{ id: AlertChannel; label: string }> = [
  { id: "slack_dm", label: "Slack DM" },
  { id: "web_push", label: "Web Push" },
  { id: "email", label: "Email" },
  { id: "desktop", label: "Desktop" },
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

type RulesSignalsLoader = () => Promise<StoredSignal[]>;

const defaultRulesSignalsLoader: RulesSignalsLoader = async () => {
  const body = (await apiFetch("/api/signals?filter=all")) as {
    signals: StoredSignal[];
  };
  return body.signals;
};

export function InboxRulesPanel({
  loader,
  saver,
  signalsLoader = defaultRulesSignalsLoader,
}: {
  loader?: () => Promise<{ rules: InboxRule[] }>;
  saver?: (
    rules: InboxRule[],
  ) => Promise<{ ok: boolean; rules?: InboxRule[]; error?: string }>;
  signalsLoader?: RulesSignalsLoader;
} = {}) {
  const [rules, setRules] = useState<InboxRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewSignals, setPreviewSignals] = useState<StoredSignal[] | null>(
    null,
  );

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
    <section aria-label="Inbox rules" className="space-y-6">
      <header>
        <h2 className="font-semibold text-2xl tracking-tight">Inbox rules</h2>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Pure rule evaluator over Signals — runs after upsert, before alert
          dispatch.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      {rules == null && !error && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}

      {rules && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          {rules.length === 0 && (
            <p className="text-muted-foreground text-sm">
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

      {rules && previewSignals && (
        <RulesPreview rules={rules} signals={previewSignals} />
      )}
    </section>
  );
}

function RulesPreview({
  rules,
  signals,
}: {
  rules: InboxRule[];
  signals: StoredSignal[];
}) {
  const matches = useMemo(
    () => previewInboxRules(signals, rules),
    [rules, signals],
  );
  const ruleNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rules) map.set(r.id, r.name || "Unnamed rule");
    return map;
  }, [rules]);

  return (
    <section
      aria-label="Rules preview"
      className="mt-6 border-t border-zinc-200 pt-4"
    >
      <h3 className="text-sm font-semibold text-zinc-900">
        Preview against recent Signals
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        {matches.length} of {signals.length} recent Signals would be affected.
      </p>
      {matches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {matches.slice(0, 10).map(({ signal, application }) => (
            <li
              key={`${signal.provider}:${signal.kind}:${signal.source_id}`}
              className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs"
            >
              <div className="font-medium text-zinc-900">{signal.title}</div>
              <div className="mt-0.5 text-zinc-500">
                {application.matched_rule_ids
                  .map((id) => ruleNames.get(id) ?? id)
                  .join(", ")}
              </div>
            </li>
          ))}
        </ul>
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
    else if (t === "tag") next = { type: "tag", tag: "" };
    else if (t === "priority") next = { type: "priority", value: "high" };
    else next = { type: "channels", channels: ["slack_dm"] };
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
  if (effect.type === "tag") {
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
  if (effect.type === "priority") {
    return (
      <select
        aria-label="Priority value"
        value={effect.value}
        onChange={(e) =>
          onChange({ ...effect, value: e.target.value as "low" | "high" })
        }
        disabled={busy}
        className="mt-2 w-full rounded border border-zinc-200 px-2 py-1"
      >
        <option value="high">High</option>
        <option value="low">Low</option>
      </select>
    );
  }
  return (
    <fieldset
      aria-label="Channels value"
      className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-700"
    >
      {ALERT_CHANNEL_OPTIONS.map((c) => {
        const checked = effect.channels.includes(c.id);
        return (
          <label key={c.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={() => {
                const next = checked
                  ? effect.channels.filter((x) => x !== c.id)
                  : [...effect.channels, c.id];
                onChange({ ...effect, channels: next });
              }}
            />
            {c.label}
          </label>
        );
      })}
    </fieldset>
  );
}
