// Account resolver — single decision point for "which account does this
// outbound action target?" (#119).
//
// The rule: when the action originates from a Signal, target the same
// account_id that brought the Signal in (smart default). When there's no
// Signal context, fall back to the provider's primary account. Single-
// account providers always return that account regardless of context.
// Focus → Slack DND is the one explicit fan-out: every connected Slack
// account participates so heads-down means heads-down everywhere (#120
// consumes the fan-out branch; this module owns the rule).
//
// Pure with respect to the accounts repo. Callers load accounts via
// `listAccounts(...)` and hand the array in; the resolver itself does no
// IO. This keeps the rule snapshot-testable and lets fan-out callers
// (focus session) and single-target callers (calendar / draft-reply /
// GitHub action) share the same resolution path.

import type { Account } from "#/features/integrations/accounts/store";

export type ActionKind =
  // Outbound single-target actions
  | "calendar-event-create"
  | "calendar-event-edit"
  | "draft-reply-send"
  | "github-action"
  // Fan-out
  | "focus-slack-dnd";

export type OriginatingSignalContext = {
  provider: string;
  account_id: string | null;
};

export type ResolveArgs = {
  providerId: string;
  actionKind: ActionKind;
  originatingSignal?: OriginatingSignalContext | null;
  accounts: Account[];
};

export type ResolveResult =
  | { mode: "single"; accounts: [Account] }
  | { mode: "fanout"; accounts: Account[] }
  | { mode: "single"; accounts: [] };

/**
 * Resolve which account(s) an outbound action should target.
 *
 * - Focus → Slack DND fans out across every connected Slack account.
 * - When the action originates from a Signal whose `account_id` is in
 *   the accounts list, that account wins (smart default).
 * - Otherwise, the provider's `primary` account wins (fallback).
 * - Single-account providers always return that account regardless of
 *   context. The mode is still `single`; the UI uses the accounts list
 *   length to decide whether to render an override picker.
 * - Returns an empty `single` result when the provider has no accounts.
 */
export function resolve(args: ResolveArgs): ResolveResult {
  const forProvider = args.accounts.filter(
    (a) => a.provider === args.providerId,
  );

  if (args.actionKind === "focus-slack-dnd") {
    return { mode: "fanout", accounts: forProvider };
  }

  if (forProvider.length === 0) {
    return { mode: "single", accounts: [] };
  }

  if (forProvider.length === 1) {
    return { mode: "single", accounts: [forProvider[0]] };
  }

  const fromSignal =
    args.originatingSignal &&
    args.originatingSignal.provider === args.providerId &&
    args.originatingSignal.account_id
      ? forProvider.find(
          (a) => a.id === args.originatingSignal?.account_id,
        ) ?? null
      : null;
  if (fromSignal) return { mode: "single", accounts: [fromSignal] };

  const primary = forProvider.find((a) => a.primary) ?? forProvider[0];
  return { mode: "single", accounts: [primary] };
}
