// Inline WHEN/THEN rule composer (per PRD #29 mockup #2 / issue #42).
//
// Pure presentational deep module: takes an optional `initial` rule plus
// `onSave` / `onCancel` callbacks, owns local state for matchAll, conds,
// action, actionParam, and name. Field/op/value chips are styled native
// <select>s per the AC. Backend persistence is out of scope.

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/cn";

export type Cond = { field: string; op: string; value: string };

export type Rule = {
  matchAll: boolean;
  conds: Cond[];
  action: ActionId;
  actionParam?: string;
  name: string;
};

type FieldDef = {
  id: string;
  label: string;
  ops: ReadonlyArray<{ id: string; label: string }>;
  values: ReadonlyArray<{ id: string; label: string }>;
};

const FIELDS: ReadonlyArray<FieldDef> = [
  {
    id: "source",
    label: "source",
    ops: [
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
    values: [
      { id: "github", label: "GitHub" },
      { id: "slack", label: "Slack" },
      { id: "calendar", label: "Calendar" },
      { id: "linear", label: "Linear" },
    ],
  },
  {
    id: "kind",
    label: "kind",
    ops: [
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
    values: [
      { id: "pr_review", label: "PR review" },
      { id: "mention", label: "@mention" },
      { id: "ci_failure", label: "CI failure" },
      { id: "meeting", label: "meeting" },
      { id: "ticket_comment", label: "ticket comment" },
      { id: "broadcast", label: "Slack broadcast" },
    ],
  },
  {
    id: "repo",
    label: "repo",
    ops: [
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
    values: [
      { id: "clearday", label: "clearday" },
      { id: "devy-worker", label: "devy-worker" },
      { id: "devy-web", label: "devy-web" },
    ],
  },
  {
    id: "author",
    label: "author",
    ops: [
      { id: "is", label: "is" },
      { id: "is_not", label: "is not" },
    ],
    values: [
      { id: "me", label: "me" },
      { id: "dependabot", label: "dependabot" },
      { id: "renovate", label: "renovate" },
      { id: "anyone", label: "anyone" },
    ],
  },
];

export type ActionId =
  | "skip_inbox"
  | "label"
  | "snooze"
  | "forward_slack"
  | "mark_read";

type ActionDef = {
  id: ActionId;
  label: string;
  param?: { placeholder: string };
};

const ACTIONS: ReadonlyArray<ActionDef> = [
  { id: "skip_inbox", label: "Skip inbox" },
  { id: "label", label: "Add label", param: { placeholder: "label name" } },
  { id: "snooze", label: "Snooze for", param: { placeholder: "1h, 4h, 1d…" } },
  {
    id: "forward_slack",
    label: "Forward to Slack",
    param: { placeholder: "#channel" },
  },
  { id: "mark_read", label: "Mark as read" },
];

const DEFAULT_COND: Cond = {
  field: FIELDS[0].id,
  op: FIELDS[0].ops[0].id,
  value: FIELDS[0].values[0].id,
};

type Props = {
  initial?: Rule;
  onSave: (rule: Rule) => void;
  onCancel: () => void;
};

const chipClass =
  "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

export function RuleBuilder({ initial, onSave, onCancel }: Props) {
  const [matchAll, setMatchAll] = useState<boolean>(initial?.matchAll ?? true);
  const [conds, setConds] = useState<Cond[]>(initial?.conds ?? [DEFAULT_COND]);
  const [action, setAction] = useState<ActionId>(
    initial?.action ?? "skip_inbox",
  );
  const [actionParam, setActionParam] = useState<string>(
    initial?.actionParam ?? "",
  );
  const [name, setName] = useState<string>(initial?.name ?? "");

  const actionDef = ACTIONS.find((a) => a.id === action);
  const hasParam = Boolean(actionDef?.param);

  const updateCond = (idx: number, next: Cond) => {
    setConds((prev) => prev.map((c, i) => (i === idx ? next : c)));
  };

  const onChangeField = (idx: number, fieldId: string) => {
    const def = FIELDS.find((f) => f.id === fieldId) ?? FIELDS[0];
    updateCond(idx, {
      field: def.id,
      op: def.ops[0].id,
      value: def.values[0].id,
    });
  };

  const onAddCond = () => {
    setConds((prev) => [...prev, DEFAULT_COND]);
  };

  const onRemoveCond = (idx: number) => {
    setConds((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  };

  const onChangeAction = (next: ActionId) => {
    const def = ACTIONS.find((a) => a.id === next);
    setAction(next);
    if (!def?.param) setActionParam("");
  };

  const onClickSave = () => {
    onSave({
      matchAll,
      conds,
      action,
      actionParam: hasParam ? actionParam : undefined,
      name,
    });
  };

  return (
    <article
      aria-label="Rule builder"
      className="rounded-lg border border-border bg-background p-5 shadow-sm"
    >
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-base">
          {initial ? "Edit rule" : "New rule"}
        </h3>
        <fieldset className="inline-flex rounded-md border border-border p-0.5">
          <legend className="sr-only">Match mode</legend>
          <button
            type="button"
            aria-pressed={matchAll}
            onClick={() => setMatchAll(true)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs",
              matchAll
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            Match all
          </button>
          <button
            type="button"
            aria-pressed={!matchAll}
            onClick={() => setMatchAll(false)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs",
              !matchAll
                ? "bg-foreground text-background"
                : "text-muted-foreground",
            )}
          >
            Match any
          </button>
        </fieldset>
      </header>

      <section className="mt-4">
        <div className="mb-2 text-muted-foreground text-xs uppercase tracking-wider">
          When
        </div>
        <ul aria-label="Conditions" className="flex flex-col gap-2">
          {conds.map((cond, idx) => {
            const fieldDef =
              FIELDS.find((f) => f.id === cond.field) ?? FIELDS[0];
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                key={idx}
                className="flex flex-wrap items-center gap-2"
              >
                <select
                  aria-label={`Condition ${idx + 1} field`}
                  className={chipClass}
                  value={cond.field}
                  onChange={(e) => onChangeField(idx, e.target.value)}
                >
                  {FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Condition ${idx + 1} operator`}
                  className={chipClass}
                  value={cond.op}
                  onChange={(e) =>
                    updateCond(idx, { ...cond, op: e.target.value })
                  }
                >
                  {fieldDef.ops.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Condition ${idx + 1} value`}
                  className={chipClass}
                  value={cond.value}
                  onChange={(e) =>
                    updateCond(idx, { ...cond, value: e.target.value })
                  }
                >
                  {fieldDef.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove condition ${idx + 1}`}
                  onClick={() => onRemoveCond(idx)}
                  disabled={conds.length <= 1}
                  className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onAddCond}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border border-dashed px-3 py-1.5 text-muted-foreground text-xs hover:border-foreground hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Add condition
        </button>
      </section>

      <section className="mt-5">
        <div className="mb-2 text-muted-foreground text-xs uppercase tracking-wider">
          Then
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Action"
            className={chipClass}
            value={action}
            onChange={(e) => onChangeAction(e.target.value as ActionId)}
          >
            {ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {hasParam ? (
            <Input
              aria-label="Action parameter"
              value={actionParam}
              onChange={(e) => setActionParam(e.target.value)}
              placeholder={actionDef?.param?.placeholder}
              className="h-8 max-w-[14rem] font-mono text-xs"
            />
          ) : null}
        </div>
      </section>

      <section className="mt-5">
        <Input
          aria-label="Rule name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this rule"
          className="max-w-md"
        />
      </section>

      <footer className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="outline">
          Test on history
        </Button>
        <Button type="button" onClick={onClickSave}>
          Save rule
        </Button>
      </footer>
    </article>
  );
}
