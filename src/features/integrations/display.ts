// UI-side display helpers for Provider and Signal kind. Centralizes the
// per-provider icon/label dispatch and the signal-kind → human label table
// so routes don't each repeat the same switch statements.

import type { SignalProvider } from "#/shared/signal";

export type SourceKind =
  | "git"
  | "slack"
  | "cal"
  | "task"
  | "linear"
  | "jira"
  | "ai";

export function providerSourceKind(provider: SignalProvider): SourceKind {
  if (provider === "github") return "git";
  if (provider === "slack") return "slack";
  if (provider === "google") return "cal";
  return "task";
}

export function providerOpenLabel(provider: SignalProvider): string {
  if (provider === "github") return "Open in GitHub";
  if (provider === "slack") return "Open in Slack";
  if (provider === "linear") return "Open in Linear";
  if (provider === "jira") return "Open in Jira";
  return "Open in Calendar";
}

export function signalKindLabel(kind: string): string {
  switch (kind) {
    case "pr_review_requested":
      return "Review requested";
    case "pr_authored":
      return "Authored PR";
    case "pr_assigned":
      return "Assigned PR";
    case "meeting":
      return "Meeting";
    case "dm":
      return "Direct message";
    case "mention":
      return "Mention";
    case "thread_reply":
      return "Thread reply";
    case "ticket_assigned":
      return "Todo";
    case "ticket_in_progress":
      return "In progress";
    case "ticket_in_review":
      return "In review";
    case "ticket_blocked":
      return "Blocked";
    default:
      return kind;
  }
}
