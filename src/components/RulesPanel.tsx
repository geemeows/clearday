// Settings → Inbox rules panel (per PRD #29 mockup #2 / issue #42).
//
// Lists existing rules with WHEN/THEN code chips, hits/30d, Edit, on/off
// Switch. "+ New rule" opens an inline RuleBuilder card. Backend rule
// evaluation is out of scope — toggle and save update local state only.

import { Plus } from "lucide-react";
import { useState } from "react";
import { type Rule, RuleBuilder } from "#/components/RuleBuilder";
import { Button } from "#/components/ui/button";
import { Switch } from "#/components/ui/switch";

type StoredRule = Rule & {
  id: string;
  enabled: boolean;
  hits30d: number;
};

const DEFAULT_RULES: ReadonlyArray<StoredRule> = [
  {
    id: "skip-dependabot",
    name: "Skip Dependabot PRs",
    matchAll: true,
    conds: [{ field: "author", op: "is", value: "dependabot" }],
    action: "skip_inbox",
    enabled: true,
    hits30d: 142,
  },
  {
    id: "label-ci-fail",
    name: "Label CI failures",
    matchAll: true,
    conds: [{ field: "kind", op: "is", value: "ci_failure" }],
    action: "label",
    actionParam: "ci-fail",
    enabled: true,
    hits30d: 23,
  },
  {
    id: "mute-broadcasts",
    name: "Mute Slack broadcasts",
    matchAll: true,
    conds: [{ field: "kind", op: "is", value: "broadcast" }],
    action: "mark_read",
    enabled: false,
    hits30d: 87,
  },
];

const ACTION_LABELS: Record<Rule["action"], string> = {
  skip_inbox: "Skip inbox",
  label: "Add label",
  snooze: "Snooze for",
  forward_slack: "Forward to Slack",
  mark_read: "Mark as read",
};

function formatWhen(rule: Rule): string {
  const joiner = rule.matchAll ? " AND " : " OR ";
  return rule.conds
    .map((c) => `${c.field} ${c.op.replace("_", " ")} ${c.value}`)
    .join(joiner);
}

function formatThen(rule: Rule): string {
  const label = ACTION_LABELS[rule.action];
  return rule.actionParam ? `${label} "${rule.actionParam}"` : label;
}

export function RulesPanel() {
  const [rules, setRules] = useState<StoredRule[]>(() => [...DEFAULT_RULES]);
  const [builderOpen, setBuilderOpen] = useState(false);

  const onToggle = (id: string, next: boolean) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)),
    );
  };

  const onSaveNew = (rule: Rule) => {
    setRules((prev) => [
      ...prev,
      {
        ...rule,
        id: `rule-${prev.length + 1}-${Date.now()}`,
        enabled: true,
        hits30d: 0,
      },
    ]);
    setBuilderOpen(false);
  };

  return (
    <section>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-xl">Inbox rules</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Automate triage. Each rule runs on every incoming signal — first
            match wins.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setBuilderOpen(true)}
          aria-label="New rule"
        >
          <Plus className="size-4" />
          New rule
        </Button>
      </header>

      <ul
        aria-label="Inbox rules"
        className="mt-6 divide-y divide-border rounded-md border border-border"
      >
        {rules.map((rule) => (
          <li
            key={rule.id}
            aria-label={`${rule.name} rule`}
            className="flex items-center gap-4 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{rule.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">WHEN</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {formatWhen(rule)}
                </code>
                <span className="text-muted-foreground">THEN</span>
                <span className="font-medium">{formatThen(rule)}</span>
              </div>
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {rule.hits30d} hits / 30d
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit ${rule.name}`}
            >
              Edit
            </Button>
            <Switch
              aria-label={`${rule.name} enabled`}
              checked={rule.enabled}
              onCheckedChange={(next) => onToggle(rule.id, next)}
            />
          </li>
        ))}
      </ul>

      {builderOpen ? (
        <div className="mt-6">
          <RuleBuilder
            onSave={onSaveNew}
            onCancel={() => setBuilderOpen(false)}
          />
        </div>
      ) : null}
    </section>
  );
}
