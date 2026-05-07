// Trigger registry. Future kinds (`focus_started`, `focus_ended`, `schedule`)
// plug in here without changing the planner shape.
//
// `triggerEventId` builds the stable string used for run idempotency. For
// `signal_ingested` it's `${signal.id}:${signal.created_at}` — a re-poll of
// the same fresh Signal yields the same id. For `signal_state_change` it's
// `${signal.id}:${signal.updated_at}` — a re-poll of an already-updated row
// yields the same id. Either way the unique index on
// `automation_runs (automation_id, trigger_event_id)` short-circuits the
// duplicate dispatch.

import type {
  AutomationEvent,
  AutomationTriggerKind,
} from "#/features/automations/engine";

export type TriggerDescriptor = {
  kind: AutomationTriggerKind;
  label: string;
};

export const TRIGGERS: Record<AutomationTriggerKind, TriggerDescriptor> = {
  signal_ingested: {
    kind: "signal_ingested",
    label: "Signal ingested",
  },
  signal_state_change: {
    kind: "signal_state_change",
    label: "Signal state change",
  },
};

export const TRIGGER_LIST: TriggerDescriptor[] = Object.values(TRIGGERS);

export function triggerEventId(
  event: AutomationEvent,
  signalId: string,
  /** `created_at` for `signal_ingested`; `updated_at` for `signal_state_change`. */
  signalTimestamp: string,
): string {
  switch (event.kind) {
    case "signal_ingested":
      return `${signalId}:${signalTimestamp}`;
    case "signal_state_change":
      return `${signalId}:${signalTimestamp}`;
  }
}
