// Shared Signal type. The unified entity for every actionable / time-bound
// thing Clearday surfaces. Identity = (provider, kind, source_id); updates
// upsert into the same row, never duplicate. See ADR-0002.

import type { AlertChannel } from "#/features/alerts/dispatcher";

export type SignalProvider = "github" | "google" | "slack" | "linear" | "jira";

export type SignalKind =
  // GitHub PRs
  | "pr_review_requested"
  | "pr_authored"
  | "pr_assigned"
  // Calendar
  | "meeting"
  // Slack
  | "dm"
  | "mention"
  | "thread_reply"
  // Tickets (Linear / Jira)
  | "ticket_assigned"
  | "ticket_in_progress"
  | "ticket_in_review"
  | "ticket_blocked";

export type Signal = {
  provider: SignalProvider;
  kind: SignalKind;
  source_id: string;
  title: string;
  url: string | null;
  payload: Record<string, unknown>;
  requires_action: boolean;
  source_created_at: string | null;
};

export type SignalPriority = "low" | "high";

export type LinkedItem =
  | { kind: "pr"; url: string; repo: string; number: number }
  | { kind: "ticket"; url: string; key: string };

export type StoredSignal = Signal & {
  id: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  priority: SignalPriority | null;
  snoozed_until: string | null;
  alert_channels_override: AlertChannel[] | null;
  tags: string[] | null;
};
