// Urgent-override flow for the Focus auto-reply CTA (issue #94).
//
// When a Slack 🚨 reaction lands on a Clearday-posted auto-reply, the Slack
// poll hook (`pollSlackReactionsForPosts`) emits an UrgentReactionEvent. This
// module is the orchestrator-side glue that turns each event into a
// `signal_state_change` with `priority = high` and re-enters the existing
// alerts dispatcher so the user's enabled channels (slack_dm / web_push /
// email / desktop) all fire uniformly — no bespoke channel logic.
//
// Pure against the injected lookup + dispatcher deps; the worker plumbs real
// Supabase + channel senders, tests pass mocks at the boundary.

import {
  type DispatcherDeps,
  dispatchAlert,
  type DispatchResult,
} from "#/features/alerts/dispatcher";
import type { UrgentReactionEvent } from "#/features/integrations/providers/slack/poll";
import type { StoredSignal } from "#/shared/signal";

export type UrgentOverrideDeps = {
  /**
   * Resolve the originating Slack Signal Clearday auto-replied to. The Slack
   * poll hook stamps `signal_id` onto each reaction event so this lookup is
   * a direct Supabase fetch keyed on the Signal id; null falls back to
   * skipping (the original Signal was deleted / dismissed).
   */
  loadSignal: (signalId: string) => Promise<StoredSignal | null>;
  /** Existing alerts dispatcher deps (channel senders, prefs, focus ctx). */
  alerts: DispatcherDeps;
};

export type UrgentOverrideOutcome =
  | { signal_id: string; status: "skipped_unknown_signal" }
  | { signal_id: string; status: "dispatched"; result: DispatchResult };

/**
 * Process a batch of urgent reaction events. For each event we re-enter the
 * alerts dispatcher with the originating Signal upgraded to `priority = high`
 * — `dispatchAlert`'s own `(signal_id, threshold)` idempotency on
 * `signal_alerts` keeps repeat reactions from re-firing the user's channels.
 */
export async function processUrgentReactions(
  events: ReadonlyArray<UrgentReactionEvent>,
  deps: UrgentOverrideDeps,
): Promise<UrgentOverrideOutcome[]> {
  const out: UrgentOverrideOutcome[] = [];
  // De-dupe within the batch on signal_id — one signal, one urgent re-alert
  // per poll cycle, regardless of how many reactors hit 🚨.
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.signal_id)) continue;
    seen.add(event.signal_id);
    const signal = await deps.loadSignal(event.signal_id);
    if (!signal) {
      out.push({
        signal_id: event.signal_id,
        status: "skipped_unknown_signal",
      });
      continue;
    }
    const upgraded: StoredSignal = { ...signal, priority: "high" };
    const result = await dispatchAlert(upgraded, "new", deps.alerts);
    out.push({ signal_id: event.signal_id, status: "dispatched", result });
  }
  return out;
}
