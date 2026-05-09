// Fixture templates for the empty-state "Browse templates" modal. Mirrors the
// six PRD #87 demo flows (one per trigger kind, plus the two PR-review flows
// that motivate the feature). Each entry pairs a one-line description with an
// `Automation` shape sans `id`; the panel clones it with a fresh id when the
// user picks "Use template", so the seeded row only exists in the builder
// until the user saves.
//
// Signals the v2 community-templates path PRD #87 defers, while giving v1
// users a structured first-run instead of a blank canvas.

import type { Automation } from "#/features/automations/engine";

export type AutomationTemplate = {
  id: string;
  description: string;
  automation: Omit<Automation, "id">;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "pr-review-post",
    description:
      "When a PR you authored lands, post a Slack message with the title and link.",
    automation: {
      name: "Post new PRs to Slack",
      enabled: true,
      priority: 100,
      trigger_kind: "signal_ingested",
      predicates: [{ type: "kind", kind: "pr_authored" }],
      actions: [
        {
          type: "post_message",
          target: "channel",
          channel: "#reviews",
          body: "Review please: {{signal.title}} — {{signal.url}}",
        },
      ],
    },
  },
  {
    id: "pr-merged-ticket-done",
    description:
      "When your PR transitions to merged, move its ticket to Done (Linear/Jira deferred).",
    automation: {
      name: "PR merged → ticket Done",
      enabled: true,
      priority: 100,
      trigger_kind: "signal_state_change",
      predicates: [
        {
          type: "state_from_to",
          field: "merged",
          from: "false",
          to: "true",
        },
      ],
      actions: [{ type: "transition_ticket", to_status: "Done" }],
    },
  },
  {
    id: "focus-auto-reply",
    description:
      "While in a Focus session, auto-reply to Slack DMs with a heads-down message.",
    automation: {
      name: "Focus auto-reply",
      enabled: true,
      priority: 100,
      trigger_kind: "signal_ingested",
      predicates: [{ type: "kind", kind: "slack_dm" }],
      actions: [
        {
          type: "post_message",
          target: "thread_reply",
          body: "Heads-down until my Focus session ends. React with 🚨 if it's urgent.",
        },
      ],
    },
  },
  {
    id: "focus-ended-summary",
    description:
      "When a Focus session ends, post a 'back online' status to your self-DM.",
    automation: {
      name: "Back online when Focus ends",
      enabled: true,
      priority: 100,
      trigger_kind: "focus_ended",
      predicates: [],
      actions: [
        {
          type: "post_message",
          target: "self_dm",
          body: "Back online — picking up threads now.",
        },
      ],
    },
  },
  {
    id: "start-focus-after-mention",
    description:
      "When a high-priority mention lands, start a 25-minute Focus session.",
    automation: {
      name: "Focus on triage",
      enabled: true,
      priority: 100,
      trigger_kind: "signal_ingested",
      predicates: [{ type: "kind", kind: "mention" }],
      actions: [{ type: "set_focus", duration_minutes: 25 }],
    },
  },
  {
    id: "schedule-9am-roundup",
    description:
      "Every weekday at 9am, post yesterday's merged-PR roundup to your self-DM.",
    automation: {
      name: "Daily 9am merged-PR roundup",
      enabled: false,
      priority: 100,
      trigger_kind: "schedule",
      trigger_config: { cron: "0 9 * * 1-5" },
      predicates: [],
      actions: [
        {
          type: "post_message",
          target: "self_dm",
          body: "{{schedule.merged_prs_summary}}",
        },
      ],
    },
  },
];
