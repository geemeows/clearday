// Trigger registry. v1 ships only `signal_ingested`; future kinds
// (`signal_state_change`, `focus_started`, `focus_ended`, `schedule`) plug in
// here without changing the planner shape.
//
// `triggerEventId` builds the stable string used for run idempotency. For
// `signal_ingested` it's `${signal.id}:${signal.created_at}` — a re-poll of
// the same Signal yields the same id, and the unique index on
// `automation_runs (automation_id, trigger_event_id)` short-circuits a
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
};

export const TRIGGER_LIST: TriggerDescriptor[] = Object.values(TRIGGERS);

export function triggerEventId(
  event: AutomationEvent,
  signalId: string,
  signalCreatedAt: string,
): string {
  switch (event.kind) {
    case "signal_ingested":
      return `${signalId}:${signalCreatedAt}`;
  }
}
