// Automations engine. Pure, deterministic, ordered planner.
//
// Each Automation has a typed `trigger_kind`, an ordered list of `predicates`
// AND-matched against the trigger event, and a flat list of `actions` that
// fan out on a match. The engine is decoupled from Supabase: callers pass the
// Automation list in. v1 ships only the `signal_ingested` trigger; future
// trigger kinds plug in here without changing the planner shape.
//
// The internal-action vocabulary (dismiss, snooze, tag, set_priority,
// set_channels) carries over from the old inbox-rules surface. The signal
// upsert seam consults `applyAutomationsToSignal` so every persisted Signal
// lands with the matching internal-action overrides applied atomically with
// the insert; the executor records run rows after the fact for idempotency
// and history.

import type { AlertChannel } from "#/features/alerts/dispatcher";
import type { Signal, SignalPriority } from "#/shared/signal";

const ALERT_CHANNELS: readonly AlertChannel[] = [
  "slack_dm",
  "web_push",
  "email",
  "desktop",
] as const;

export type AutomationPredicate =
  | { type: "provider"; provider: string }
  | { type: "kind"; kind: string }
  | { type: "source_match"; field: string; equals: string }
  | { type: "title_regex"; pattern: string }
  // Only meaningful for `signal_state_change` events. Matches when the
  // `payload[field]` value transitioned from `from` to `to` (either bound is
  // optional but at least one must be supplied — see validateAutomations).
  // Non-string payload values are coerced via String() so a boolean
  // `merged: true` matches `to: "true"`.
  | {
      type: "state_from_to";
      field: string;
      from?: string;
      to?: string;
    };

export type AutomationAction =
  | { type: "dismiss" }
  | { type: "snooze"; minutes: number }
  | { type: "tag"; tag: string }
  | { type: "set_priority"; value: SignalPriority }
  | { type: "set_channels"; channels: AlertChannel[] }
  // Stub action wired ahead of the Linear/Jira capability landing. The
  // planner accepts and persists it, but the executor short-circuits to
  // `skipped_no_capability` until a ticket-tracker capability is registered.
  | { type: "transition_ticket"; to_status: string }
  // Starts an N-minute Focus session via features/focus/session. Routed by
  // the executor's injected handler — the default no-op handler is replaced
  // in the worker by a handler that calls startFocusSession.
  | { type: "set_focus"; duration_minutes: number };

export type AutomationTriggerKind =
  | "signal_ingested"
  | "signal_state_change"
  | "focus_started"
  | "focus_ended";

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger_kind: AutomationTriggerKind;
  predicates: AutomationPredicate[];
  actions: AutomationAction[];
};

export type SignalIngestedEvent = {
  kind: "signal_ingested";
  signal: Signal;
};

export type SignalStateChangeEvent = {
  kind: "signal_state_change";
  /** The Signal row as it stood before the upsert UPDATE landed. */
  before: Signal;
  /** The Signal row as it stands after the UPDATE. */
  after: Signal;
};

export type FocusBoundaryEvent = {
  kind: "focus_started" | "focus_ended";
  /** Stable session identifier; combined with the boundary into the trigger event id. */
  session_id: string;
  /** Total session duration in minutes. Carried on both boundaries. */
  duration_minutes: number;
};

export type AutomationEvent =
  | SignalIngestedEvent
  | SignalStateChangeEvent
  | FocusBoundaryEvent;

export type PlannedAutomation = {
  automation_id: string;
  actions: AutomationAction[];
};

/**
 * Pure planner. Given an event and the user's automations, returns one entry
 * per fired automation in priority-ascending order. Each entry holds the
 * automation id and the ordered actions to dispatch. The executor consumes
 * this output, records `automation_runs` rows, and carries out the actions.
 */
export function planAutomations(
  event: AutomationEvent,
  automations: Automation[],
): PlannedAutomation[] {
  const planned: PlannedAutomation[] = [];
  const ordered = [...automations].sort((a, b) => a.priority - b.priority);
  const isFocusEvent =
    event.kind === "focus_started" || event.kind === "focus_ended";
  for (const a of ordered) {
    if (!a.enabled) continue;
    if (a.trigger_kind !== event.kind) continue;
    // Focus boundary events have no Signal-shaped fields to filter on, so an
    // empty predicate list is a valid "fire on every boundary" automation.
    // Signal triggers still require at least one predicate.
    if (!isFocusEvent && a.predicates.length === 0) continue;
    if (!a.predicates.every((p) => matchesPredicate(p, event))) continue;
    planned.push({ automation_id: a.id, actions: a.actions });
  }
  return planned;
}

function matchesPredicate(
  p: AutomationPredicate,
  event: AutomationEvent,
): boolean {
  // Focus boundary events carry no Signal payload — predicates targeting
  // signal fields can't match. The planner still calls into here when the
  // automation has predicates configured (see `every` in planAutomations);
  // returning false here means a misconfigured Focus automation simply
  // never fires rather than throwing.
  if (event.kind !== "signal_ingested" && event.kind !== "signal_state_change") {
    return false;
  }
  // For `signal_ingested` we match against the inserted Signal; for
  // `signal_state_change` predicates target the post-update Signal (the
  // dedicated `state_from_to` predicate consults the before/after pair).
  const after = event.kind === "signal_ingested" ? event.signal : event.after;
  const before = event.kind === "signal_state_change" ? event.before : null;
  switch (p.type) {
    case "provider":
      return after.provider === p.provider;
    case "kind":
      return after.kind === p.kind;
    case "source_match": {
      const v = (after.payload as Record<string, unknown> | null | undefined)?.[
        p.field
      ];
      return typeof v === "string" && v === p.equals;
    }
    case "title_regex": {
      try {
        return new RegExp(p.pattern).test(after.title);
      } catch {
        return false;
      }
    }
    case "state_from_to": {
      if (!before) return false;
      if (p.from === undefined && p.to === undefined) return false;
      const beforeRaw = (
        before.payload as Record<string, unknown> | null | undefined
      )?.[p.field];
      const afterRaw = (
        after.payload as Record<string, unknown> | null | undefined
      )?.[p.field];
      const beforeStr = beforeRaw === undefined ? "" : String(beforeRaw);
      const afterStr = afterRaw === undefined ? "" : String(afterRaw);
      const fromOk = p.from === undefined || beforeStr === p.from;
      const toOk = p.to === undefined || afterStr === p.to;
      return fromOk && toOk;
    }
  }
}

// ---------------------------------------------------------------------------
// applyAutomationsToSignal — the signal-upsert adapter.
//
// The signal-store seam wants a flat "patch" describing the dismissed /
// snoozed / tagged / priority / channels columns to write. We could go
// through the executor and dispatch each action separately, but for v1 every
// action is internal and lands as a column on the same Signal row, so doing
// it inline at upsert is both simpler and atomic with the insert.
// ---------------------------------------------------------------------------

export type AutomationApplication = {
  dismissed: boolean;
  snoozed_until: string | null;
  tags: string[];
  priority: SignalPriority | null;
  channels: AlertChannel[] | null;
  matched_automation_ids: string[];
};

export function applyAutomationsToSignal(
  signal: Signal,
  automations: Automation[],
  now: Date = new Date(),
): AutomationApplication {
  const result: AutomationApplication = {
    dismissed: false,
    snoozed_until: null,
    tags: [],
    priority: null,
    channels: null,
    matched_automation_ids: [],
  };
  const event: SignalIngestedEvent = { kind: "signal_ingested", signal };
  const planned = planAutomations(event, automations);
  for (const p of planned) {
    result.matched_automation_ids.push(p.automation_id);
    for (const action of p.actions) {
      applyAction(action, result, now);
    }
  }
  return result;
}

function applyAction(
  a: AutomationAction,
  result: AutomationApplication,
  now: Date,
): void {
  switch (a.type) {
    case "dismiss":
      result.dismissed = true;
      break;
    case "snooze": {
      if (!Number.isFinite(a.minutes) || a.minutes <= 0) break;
      const until = new Date(now.getTime() + a.minutes * 60_000).toISOString();
      // Pick the latest snooze when multiple automations snooze the same Signal.
      if (!result.snoozed_until || until > result.snoozed_until) {
        result.snoozed_until = until;
      }
      break;
    }
    case "tag":
      if (!a.tag) break;
      if (!result.tags.includes(a.tag)) result.tags.push(a.tag);
      break;
    case "set_priority":
      // Last-write-wins by automation order. Engine evaluates automations in
      // ascending priority order so a higher-priority automation overrides a
      // lower one.
      if (a.value === "low" || a.value === "high") result.priority = a.value;
      break;
    case "transition_ticket":
      // External capability — does not touch the Signal upsert columns.
      // Executor handles routing (or stub status) downstream.
      break;
    case "set_focus":
      // External effect (starts a Focus session). Not applied at the Signal
      // upsert seam; the executor's handler dispatches via features/focus.
      break;
    case "set_channels": {
      // Last-write-wins per slot, same vocabulary as priority. An empty list
      // is meaningful — it means "this automation says fire no channels" —
      // and is distinguished from null ("no automation fired").
      if (!Array.isArray(a.channels)) break;
      const filtered = a.channels.filter((c): c is AlertChannel =>
        ALERT_CHANNELS.includes(c as AlertChannel),
      );
      const deduped: AlertChannel[] = [];
      for (const c of filtered) if (!deduped.includes(c)) deduped.push(c);
      result.channels = deduped;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// previewAutomations — used by the builder UI to show which recently-seen
// Signals the current automation set would have shaped.
// ---------------------------------------------------------------------------

export type AutomationPreviewRow = {
  signal: Signal;
  application: AutomationApplication;
};

export function previewAutomations(
  signals: Signal[],
  automations: Automation[],
  now: Date = new Date(),
): AutomationPreviewRow[] {
  const out: AutomationPreviewRow[] = [];
  for (const signal of signals) {
    const application = applyAutomationsToSignal(signal, automations, now);
    if (application.matched_automation_ids.length === 0) continue;
    out.push({ signal, application });
  }
  return out;
}

// ---------------------------------------------------------------------------
// validateAutomations — used by the API to reject malformed PUT bodies.
// ---------------------------------------------------------------------------

const TRIGGER_KINDS: readonly AutomationTriggerKind[] = [
  "signal_ingested",
  "signal_state_change",
  "focus_started",
  "focus_ended",
];

const FOCUS_TRIGGER_KINDS: readonly AutomationTriggerKind[] = [
  "focus_started",
  "focus_ended",
];

const ACTION_TYPES = new Set<AutomationAction["type"]>([
  "dismiss",
  "snooze",
  "tag",
  "set_priority",
  "set_channels",
  "transition_ticket",
  "set_focus",
]);

const PREDICATE_TYPES = new Set<AutomationPredicate["type"]>([
  "provider",
  "kind",
  "source_match",
  "title_regex",
  "state_from_to",
]);

export function validateAutomations(automations: Automation[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const a of automations) {
    if (!a.id) errors.push("automation missing id");
    else if (seenIds.has(a.id)) errors.push(`duplicate automation id ${a.id}`);
    seenIds.add(a.id);

    if (typeof a.name !== "string" || a.name.length === 0)
      errors.push(`automation ${a.id}: name is required`);
    if (typeof a.priority !== "number" || !Number.isFinite(a.priority))
      errors.push(`automation ${a.id}: priority must be a number`);

    if (
      typeof a.trigger_kind !== "string" ||
      !TRIGGER_KINDS.includes(a.trigger_kind as AutomationTriggerKind)
    ) {
      errors.push(
        `automation ${a.id}: trigger_kind must be one of ${TRIGGER_KINDS.join(", ")}`,
      );
    }

    const isFocus = FOCUS_TRIGGER_KINDS.includes(
      a.trigger_kind as AutomationTriggerKind,
    );
    if (!Array.isArray(a.predicates))
      errors.push(`automation ${a.id}: predicates must be an array`);
    else if (!isFocus && a.predicates.length === 0)
      errors.push(`automation ${a.id}: at least one predicate required`);
    if (!Array.isArray(a.actions) || a.actions.length === 0)
      errors.push(`automation ${a.id}: at least one action required`);

    for (const p of a.predicates ?? []) {
      const ptype = (p as { type?: AutomationPredicate["type"] })?.type;
      if (!ptype || !PREDICATE_TYPES.has(ptype)) {
        errors.push(`automation ${a.id}: unknown predicate type "${ptype}"`);
        continue;
      }
      if (p.type === "title_regex") {
        try {
          new RegExp(p.pattern);
        } catch {
          errors.push(`automation ${a.id}: invalid regex "${p.pattern}"`);
        }
      }
      if (p.type === "state_from_to") {
        if (typeof p.field !== "string" || p.field.length === 0) {
          errors.push(`automation ${a.id}: state_from_to.field is required`);
        }
        if (p.from === undefined && p.to === undefined) {
          errors.push(
            `automation ${a.id}: state_from_to requires at least one of from/to`,
          );
        }
      }
    }

    for (const act of a.actions ?? []) {
      const atype = (act as { type?: AutomationAction["type"] })?.type;
      if (!atype || !ACTION_TYPES.has(atype)) {
        errors.push(`automation ${a.id}: unknown action type "${atype}"`);
        continue;
      }
      if (act.type === "snooze") {
        if (
          typeof act.minutes !== "number" ||
          !Number.isFinite(act.minutes) ||
          act.minutes <= 0
        ) {
          errors.push(
            `automation ${a.id}: snooze.minutes must be a positive number`,
          );
        }
      }
      if (act.type === "set_priority") {
        if (act.value !== "low" && act.value !== "high") {
          errors.push(
            `automation ${a.id}: set_priority.value must be "low" or "high"`,
          );
        }
      }
      if (act.type === "transition_ticket") {
        if (typeof act.to_status !== "string") {
          errors.push(
            `automation ${a.id}: transition_ticket.to_status must be a string`,
          );
        }
      }
      if (act.type === "set_focus") {
        if (
          typeof act.duration_minutes !== "number" ||
          !Number.isFinite(act.duration_minutes) ||
          act.duration_minutes <= 0
        ) {
          errors.push(
            `automation ${a.id}: set_focus.duration_minutes must be a positive number`,
          );
        }
      }
      if (act.type === "set_channels") {
        if (!Array.isArray(act.channels)) {
          errors.push(
            `automation ${a.id}: set_channels.channels must be an array`,
          );
        }
      }
    }
  }
  return errors;
}
