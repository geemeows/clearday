// Inbox rules engine. Pure, deterministic, ordered.
//
// Rules are stored in `public.inbox_rules` (created in 0001_init.sql) but the
// engine itself is decoupled from Supabase: callers pass the rule list in.
// The signal-store upsert seam consults this engine for every Signal write so
// every persisted Signal lands with the right overrides applied.
//
// Predicates ALL must match (AND) for a rule to fire. Rules are evaluated in
// ascending `priority` order; later rules can compound overrides (e.g. one
// rule tags `dependabot`, another tags `low-priority`) but each effect is
// last-write-wins for its own slot (auto_dismiss is sticky once set; snooze
// uses the longest window seen; tags accumulate).

import type { AlertChannel } from "#/lib/alert-dispatcher";
import type { Signal, SignalPriority } from "#/lib/signal";

const ALERT_CHANNELS: readonly AlertChannel[] = [
  "slack_dm",
  "web_push",
  "email",
  "desktop",
] as const;

export type RulePredicate =
  | { type: "provider"; provider: string }
  | { type: "kind"; kind: string }
  | { type: "source_match"; field: string; equals: string }
  | { type: "title_regex"; pattern: string };

export type RuleEffect =
  | { type: "auto_dismiss" }
  | { type: "snooze"; minutes: number }
  | { type: "tag"; tag: string }
  | { type: "priority"; value: SignalPriority }
  | { type: "channels"; channels: AlertChannel[] };

export type InboxRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  predicates: RulePredicate[];
  effects: RuleEffect[];
};

export type RuleApplication = {
  dismissed: boolean;
  snoozed_until: string | null;
  tags: string[];
  priority: SignalPriority | null;
  channels: AlertChannel[] | null;
  matched_rule_ids: string[];
};

export function applyInboxRules(
  signal: Signal,
  rules: InboxRule[],
  now: Date = new Date(),
): RuleApplication {
  const result: RuleApplication = {
    dismissed: false,
    snoozed_until: null,
    tags: [],
    priority: null,
    channels: null,
    matched_rule_ids: [],
  };
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (!rule.enabled) continue;
    if (rule.predicates.length === 0) continue;
    if (!rule.predicates.every((p) => matchesPredicate(p, signal))) continue;
    result.matched_rule_ids.push(rule.id);
    for (const effect of rule.effects) {
      applyEffect(effect, result, now);
    }
  }
  return result;
}

function matchesPredicate(p: RulePredicate, s: Signal): boolean {
  switch (p.type) {
    case "provider":
      return s.provider === p.provider;
    case "kind":
      return s.kind === p.kind;
    case "source_match": {
      const v = (s.payload as Record<string, unknown> | null | undefined)?.[
        p.field
      ];
      return typeof v === "string" && v === p.equals;
    }
    case "title_regex": {
      try {
        return new RegExp(p.pattern).test(s.title);
      } catch {
        return false;
      }
    }
  }
}

function applyEffect(e: RuleEffect, result: RuleApplication, now: Date): void {
  switch (e.type) {
    case "auto_dismiss":
      result.dismissed = true;
      break;
    case "snooze": {
      if (!Number.isFinite(e.minutes) || e.minutes <= 0) break;
      const until = new Date(now.getTime() + e.minutes * 60_000).toISOString();
      // Pick the latest snooze when multiple rules snooze the same Signal.
      if (!result.snoozed_until || until > result.snoozed_until) {
        result.snoozed_until = until;
      }
      break;
    }
    case "tag":
      if (!e.tag) break;
      if (!result.tags.includes(e.tag)) result.tags.push(e.tag);
      break;
    case "priority":
      // Last-write-wins by rule order. Engine evaluates rules in ascending
      // priority order so a higher-priority rule overrides a lower one.
      if (e.value === "low" || e.value === "high") result.priority = e.value;
      break;
    case "channels": {
      // Last-write-wins per slot, same vocabulary as priority. An empty list
      // is meaningful — it means "this rule says fire no channels" — and is
      // distinguished from null ("no rule fired").
      if (!Array.isArray(e.channels)) break;
      const filtered = e.channels.filter((c): c is AlertChannel =>
        ALERT_CHANNELS.includes(c as AlertChannel),
      );
      const deduped: AlertChannel[] = [];
      for (const c of filtered) if (!deduped.includes(c)) deduped.push(c);
      result.channels = deduped;
      break;
    }
  }
}

export type RulePreviewRow = {
  signal: Signal;
  application: RuleApplication;
};

/**
 * Run the engine over each Signal and keep only those that any rule fired on.
 * The settings page uses this to render a live preview of how the current
 * rule set would shape recently-seen Signals.
 */
export function previewInboxRules(
  signals: Signal[],
  rules: InboxRule[],
  now: Date = new Date(),
): RulePreviewRow[] {
  const out: RulePreviewRow[] = [];
  for (const signal of signals) {
    const application = applyInboxRules(signal, rules, now);
    if (application.matched_rule_ids.length === 0) continue;
    out.push({ signal, application });
  }
  return out;
}

/**
 * Validate a rule list; returns an array of human-readable error messages
 * (empty when valid). The API uses this to reject malformed PUT bodies.
 */
export function validateInboxRules(rules: InboxRule[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const r of rules) {
    if (!r.id) errors.push("rule missing id");
    else if (seenIds.has(r.id)) errors.push(`duplicate rule id ${r.id}`);
    seenIds.add(r.id);
    if (typeof r.name !== "string" || r.name.length === 0)
      errors.push(`rule ${r.id}: name is required`);
    if (typeof r.priority !== "number" || !Number.isFinite(r.priority))
      errors.push(`rule ${r.id}: priority must be a number`);
    if (!Array.isArray(r.predicates) || r.predicates.length === 0)
      errors.push(`rule ${r.id}: at least one predicate required`);
    if (!Array.isArray(r.effects) || r.effects.length === 0)
      errors.push(`rule ${r.id}: at least one effect required`);
    for (const p of r.predicates ?? []) {
      if (p.type === "title_regex") {
        try {
          new RegExp(p.pattern);
        } catch {
          errors.push(`rule ${r.id}: invalid regex "${p.pattern}"`);
        }
      }
    }
  }
  return errors;
}
