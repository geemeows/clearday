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
  | { type: "set_focus"; duration_minutes: number }
  // Slack `post_message` action. Stub registered ahead of the Slack
  // capability wiring (issue #90) — the planner accepts and persists it but
  // the executor's default external handler is a no-op until that slice
  // lands. `target` selects between a configured channel, the user's self
  // DM, or a thread-reply to the triggering Slack signal.
  | {
      type: "post_message";
      target: "channel" | "self_dm" | "thread_reply";
      body: string;
      channel?: string;
    };

export type AutomationTriggerKind =
  | "signal_ingested"
  | "signal_state_change"
  | "focus_started"
  | "focus_ended"
  | "schedule";

/**
 * Per-trigger configuration. v1 only the `schedule` trigger uses this slot
 * (cron expression). Other trigger kinds ignore it. Stored as JSON in the
 * `automations.trigger_config` column.
 */
export type AutomationTriggerConfig = {
  /** Standard 5-field cron expression evaluated against UTC minutes. */
  cron?: string;
};

export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger_kind: AutomationTriggerKind;
  trigger_config?: AutomationTriggerConfig;
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

export type ScheduleEvent = {
  kind: "schedule";
  /**
   * The minute boundary the cron worker is evaluating, truncated to whole
   * minutes and serialized as `YYYY-MM-DDTHH:MM:00.000Z`. Used both for cron
   * matching and as the suffix of the trigger event id, so a re-tick of the
   * same minute yields the same id and short-circuits to skipped_idempotent.
   */
  minute_iso: string;
};

export type AutomationEvent =
  | SignalIngestedEvent
  | SignalStateChangeEvent
  | FocusBoundaryEvent
  | ScheduleEvent;

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
  const isScheduleEvent = event.kind === "schedule";
  for (const a of ordered) {
    if (!a.enabled) continue;
    if (a.trigger_kind !== event.kind) continue;
    // Focus / schedule events have no Signal-shaped fields to filter on, so
    // an empty predicate list is a valid "fire on every tick / boundary"
    // automation. Signal triggers still require at least one predicate.
    if (!isFocusEvent && !isScheduleEvent && a.predicates.length === 0)
      continue;
    if (isScheduleEvent) {
      const cron = a.trigger_config?.cron;
      if (!cron || !cronMatchesMinute(cron, event.minute_iso)) continue;
    }
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
  if (
    event.kind !== "signal_ingested" &&
    event.kind !== "signal_state_change"
  ) {
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
    case "post_message":
      // External Slack capability — does not touch the Signal upsert columns.
      // Routed by the executor's injected handler once the Slack wiring lands
      // in #90; the default handler is a no-op.
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
  "schedule",
];

const PREDICATELESS_TRIGGER_KINDS: readonly AutomationTriggerKind[] = [
  "focus_started",
  "focus_ended",
  "schedule",
];

const ACTION_TYPES = new Set<AutomationAction["type"]>([
  "dismiss",
  "snooze",
  "tag",
  "set_priority",
  "set_channels",
  "transition_ticket",
  "set_focus",
  "post_message",
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

    const allowsEmptyPredicates = PREDICATELESS_TRIGGER_KINDS.includes(
      a.trigger_kind as AutomationTriggerKind,
    );
    if (!Array.isArray(a.predicates))
      errors.push(`automation ${a.id}: predicates must be an array`);
    else if (!allowsEmptyPredicates && a.predicates.length === 0)
      errors.push(`automation ${a.id}: at least one predicate required`);

    if (a.trigger_kind === "schedule") {
      const cron = a.trigger_config?.cron;
      if (typeof cron !== "string" || cron.length === 0) {
        errors.push(
          `automation ${a.id}: schedule trigger requires trigger_config.cron`,
        );
      } else if (!cronExpressionValid(cron)) {
        errors.push(`automation ${a.id}: invalid cron expression "${cron}"`);
      }
    }
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
      if (act.type === "post_message") {
        if (
          act.target !== "channel" &&
          act.target !== "self_dm" &&
          act.target !== "thread_reply"
        ) {
          errors.push(
            `automation ${a.id}: post_message.target must be one of channel, self_dm, thread_reply`,
          );
        }
        if (typeof act.body !== "string") {
          errors.push(
            `automation ${a.id}: post_message.body must be a string`,
          );
        }
        if (act.target === "channel") {
          if (typeof act.channel !== "string" || act.channel.length === 0) {
            errors.push(
              `automation ${a.id}: post_message with target "channel" requires a channel`,
            );
          }
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

// ---------------------------------------------------------------------------
// Cron — minute-granularity matcher used by the schedule trigger.
//
// Standard 5-field cron (minute, hour, day-of-month, month, day-of-week)
// evaluated against UTC. Supports `*`, exact value, comma list `a,b,c`, range
// `a-b`, and step `*/N`. No special tokens (`@daily`, `?`, `L`, …) — the
// builder UI surfaces this vocabulary so callers don't expect more.
//
// Day-of-week 0 and 7 both mean Sunday (POSIX cron convention). When both
// day-of-month and day-of-week are restricted, an OR-match fires (also POSIX
// cron); when one is `*` only the other gates the match.
// ---------------------------------------------------------------------------

type CronField = number[];

type ParsedCron = {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
  domStar: boolean;
  dowStar: boolean;
};

const CRON_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 7], // day-of-week (0/7 = Sunday)
];

function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: CronField[] = [];
  for (let i = 0; i < 5; i++) {
    const [lo, hi] = CRON_RANGES[i];
    const set = parseCronField(parts[i], lo, hi);
    if (!set) return null;
    fields.push(set);
  }
  return {
    minute: fields[0],
    hour: fields[1],
    dom: fields[2],
    month: fields[3],
    // Normalize 7 → 0 (Sunday).
    dow: fields[4].map((d) => (d === 7 ? 0 : d)),
    domStar: parts[2] === "*",
    dowStar: parts[4] === "*",
  };
}

function parseCronField(
  raw: string,
  lo: number,
  hi: number,
): CronField | null {
  const out = new Set<number>();
  for (const piece of raw.split(",")) {
    const result = expandCronPiece(piece, lo, hi);
    if (!result) return null;
    for (const v of result) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function expandCronPiece(
  piece: string,
  lo: number,
  hi: number,
): number[] | null {
  let step = 1;
  let body = piece;
  const slash = piece.indexOf("/");
  if (slash >= 0) {
    const stepStr = piece.slice(slash + 1);
    body = piece.slice(0, slash);
    const parsedStep = Number(stepStr);
    if (!Number.isInteger(parsedStep) || parsedStep <= 0) return null;
    step = parsedStep;
  }
  let start = lo;
  let end = hi;
  if (body !== "*") {
    if (body.includes("-")) {
      const [a, b] = body.split("-");
      const av = Number(a);
      const bv = Number(b);
      if (!Number.isInteger(av) || !Number.isInteger(bv)) return null;
      if (av < lo || bv > hi || av > bv) return null;
      start = av;
      end = bv;
    } else {
      const v = Number(body);
      if (!Number.isInteger(v) || v < lo || v > hi) return null;
      // No step on a bare value: it's a single value, not a sequence.
      return slash >= 0 ? rangeWithStep(v, hi, step) : [v];
    }
  }
  return rangeWithStep(start, end, step);
}

function rangeWithStep(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i += step) out.push(i);
  return out;
}

export function cronExpressionValid(expr: string): boolean {
  return parseCron(expr) !== null;
}

/**
 * True when `cron` matches the UTC minute encoded by `minuteIso`. Caller is
 * responsible for passing a minute-truncated ISO string (the orchestrator
 * builds it from `Date` rounded down to the minute).
 */
export function cronMatchesMinute(cron: string, minuteIso: string): boolean {
  const parsed = parseCron(cron);
  if (!parsed) return false;
  const date = new Date(minuteIso);
  if (Number.isNaN(date.getTime())) return false;
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay();
  if (!parsed.minute.includes(minute)) return false;
  if (!parsed.hour.includes(hour)) return false;
  if (!parsed.month.includes(month)) return false;
  // POSIX cron: when both DOM and DOW are restricted, OR them. When either is
  // `*`, only the restricted one gates the match.
  const domMatch = parsed.dom.includes(dom);
  const dowMatch = parsed.dow.includes(dow);
  if (parsed.domStar && parsed.dowStar) return true;
  if (parsed.domStar) return dowMatch;
  if (parsed.dowStar) return domMatch;
  return domMatch || dowMatch;
}

/**
 * Best-effort English summary for a cron expression. Falls back to echoing the
 * raw expression for shapes the simple humanizer doesn't recognise — the
 * builder still shows the cron string itself, this is just the friendly
 * caption next to it.
 */
export function humanizeCron(expr: string): string {
  if (!cronExpressionValid(expr)) return expr;
  const parts = expr.trim().split(/\s+/);
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*") return expr;
  const dayLabel = humanizeDow(dow);
  if (dayLabel === null) return expr;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const hh = hour.padStart(2, "0");
    const mm = minute.padStart(2, "0");
    return `${dayLabel} · ${hh}:${mm}`;
  }
  return expr;
}

function humanizeDow(field: string): string | null {
  if (field === "*") return "Every day";
  if (field === "1-5") return "Weekdays";
  if (field === "0,6" || field === "6,0") return "Weekends";
  if (/^[0-7]$/.test(field)) {
    const names = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    return names[Number(field)];
  }
  return null;
}

/**
 * Truncates a Date to whole minutes and returns the canonical
 * `YYYY-MM-DDTHH:MM:00.000Z` string used as the schedule event id suffix and
 * cron evaluation input.
 */
export function minuteIsoFromDate(date: Date): string {
  const d = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      0,
      0,
    ),
  );
  return d.toISOString();
}
