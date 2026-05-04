// Alert dispatcher. The single entry point that decides whether a Signal
// should fire an alert and routes it to the user's enabled channels.
//
// Decision pipeline (all consulted via `decideDelivery`):
//   1. Per-event matrix gates which channels can fire for this kind.
//   2. Allow-through list lets configured kinds/tags skip the gates.
//   3. Auto focus-block detection silences everything except mentions/DMs
//      and imminent meetings while a focus block is active.
//   4. Quiet hours queues the alert until the window ends (re-delivered on
//      the next dispatcher tick once `deliver_at` has passed).
//
// Idempotency is enforced by `recordIdempotency`, which inserts a row keyed
// on (signal_id, threshold) into `signal_alerts`. If the row already exists
// (unique-constraint conflict) the dispatch is a no-op — the same alert
// cannot fire twice across cron retries or redelivered webhooks.

import {
  type DeliveryDecision,
  decideDelivery,
  type FocusBlockContext,
  type NotificationPrefs,
} from "#/lib/quiet-hours";
import type { StoredSignal } from "#/lib/signal";

export type AlertChannel = "slack_dm" | "web_push" | "email" | "desktop";
export type AlertThreshold = "new" | "10min";

export type ChannelSender = (signal: StoredSignal) => Promise<void>;

export type IdempotencyResult = { alreadyRecorded: boolean };

export type DispatcherDeps = {
  loadPreferences: () => Promise<NotificationPrefs>;
  loadFocusContext: () => Promise<FocusBlockContext>;
  recordIdempotency: (
    signalId: string,
    threshold: AlertThreshold,
    channels: AlertChannel[],
  ) => Promise<IdempotencyResult>;
  enqueueDelivery: (
    signalId: string,
    threshold: AlertThreshold,
    channels: AlertChannel[],
    deliverAt: Date,
  ) => Promise<void>;
  channels: Partial<Record<AlertChannel, ChannelSender>>;
  now?: () => Date;
};

export type DispatchResult =
  | { fired: AlertChannel[]; errors: Record<string, string> }
  | { skipped: SkipReason }
  | { queued: { deliverAt: string; channels: AlertChannel[] } };

export type SkipReason =
  | "below_threshold"
  | "already_dispatched"
  | "no_matrix_channel"
  | "no_enabled_channel"
  | "focus_block";

export async function dispatchAlert(
  signal: StoredSignal,
  threshold: AlertThreshold,
  deps: DispatcherDeps,
): Promise<DispatchResult> {
  if (!shouldAlert(signal, threshold)) {
    return { skipped: "below_threshold" };
  }

  const [prefs, focus] = await Promise.all([
    deps.loadPreferences(),
    deps.loadFocusContext(),
  ]);
  const now = (deps.now ?? (() => new Date()))();
  const decision: DeliveryDecision = decideDelivery(
    signal,
    threshold,
    prefs,
    now,
    focus,
  );

  if (decision.action === "suppress") {
    // Record idempotency so the same Signal can't ping later just because
    // the same threshold tick re-runs. The decision was *made*; this isn't
    // a "deliver later" state.
    await deps.recordIdempotency(signal.id, threshold, []);
    return { skipped: decision.reason };
  }

  if (decision.action === "queue_until") {
    const idem = await deps.recordIdempotency(
      signal.id,
      threshold,
      decision.channels,
    );
    if (idem.alreadyRecorded) return { skipped: "already_dispatched" };
    await deps.enqueueDelivery(
      signal.id,
      threshold,
      decision.channels,
      decision.deliverAt,
    );
    return {
      queued: {
        deliverAt: decision.deliverAt.toISOString(),
        channels: decision.channels,
      },
    };
  }

  const idem = await deps.recordIdempotency(
    signal.id,
    threshold,
    decision.channels,
  );
  if (idem.alreadyRecorded) return { skipped: "already_dispatched" };

  return await fireChannels(signal, decision.channels, deps);
}

/**
 * Fan-out helper exposed for the queued-alert drain: signals whose quiet-hours
 * window has ended bypass the per-event gate and idempotency (already
 * recorded at queue time) and fire directly.
 */
export async function fireChannels(
  signal: StoredSignal,
  channels: AlertChannel[],
  deps: DispatcherDeps,
): Promise<{ fired: AlertChannel[]; errors: Record<string, string> }> {
  const fired: AlertChannel[] = [];
  const errors: Record<string, string> = {};
  for (const channel of channels) {
    const send = deps.channels[channel];
    if (!send) continue;
    try {
      await send(signal);
      fired.push(channel);
    } catch (err) {
      errors[channel] = err instanceof Error ? err.message : String(err);
    }
  }
  return { fired, errors };
}

/**
 * Threshold gate. Per-event matrix in `decideDelivery` further restricts
 * which channels fire; this only decides whether *any* alert path is
 * eligible at all for the (signal, threshold) pair.
 */
function shouldAlert(signal: StoredSignal, threshold: AlertThreshold): boolean {
  if (threshold === "10min") return signal.kind === "meeting";
  return signal.requires_action === true;
}
