// Action registry. v1 ships the internal-action vocabulary that supersedes
// the old inbox-rules effects. Future actions (Slack `post_message`, GitHub
// `comment_on_pr`, Focus `set_focus`, …) plug in here without changing the
// executor shape.
//
// Each descriptor declares the action label the builder UI shows and the
// "kind" — `internal` actions land as columns on the same Signal row at
// upsert time (so they apply atomically with the insert); `provider` actions
// would route through a typed Capability surface in a future slice.

import type { AutomationAction } from "#/features/automations/engine";

export type ActionDescriptor = {
  type: AutomationAction["type"];
  label: string;
  /**
   * `internal` actions land as columns on the Signal row at upsert time.
   * `deferred` actions are registered but have no live capability yet —
   * the executor stamps them `skipped_no_capability` until the relevant
   * provider capability lands.
   */
  kind: "internal" | "deferred";
};

export const ACTIONS: Record<AutomationAction["type"], ActionDescriptor> = {
  dismiss: { type: "dismiss", label: "Dismiss", kind: "internal" },
  snooze: { type: "snooze", label: "Snooze (minutes)", kind: "internal" },
  tag: { type: "tag", label: "Tag", kind: "internal" },
  set_priority: {
    type: "set_priority",
    label: "Set priority",
    kind: "internal",
  },
  set_channels: {
    type: "set_channels",
    label: "Set channels",
    kind: "internal",
  },
  transition_ticket: {
    type: "transition_ticket",
    label: "Transition ticket",
    kind: "deferred",
  },
};

export const ACTION_LIST: ActionDescriptor[] = Object.values(ACTIONS);
