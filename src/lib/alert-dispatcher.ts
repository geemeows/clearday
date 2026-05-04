// Alert dispatcher. The single entry point that decides whether a Signal
// should fire an alert and routes it to the user's enabled channels.
//
// Idempotency is enforced by `recordIdempotency`, which inserts a row keyed
// on (signal_id, threshold) into `signal_alerts`. If the row already exists
// (unique-constraint conflict) the dispatch is a no-op — the same alert
// cannot fire twice across cron retries or redelivered webhooks.
//
// Thresholds today:
//   - "new"   : fan-out on Signal write (e.g. a fresh Slack mention/DM).
//   - "10min" : meeting starting in ~10 minutes (cron-driven).
//
// Channels today: "slack_dm". Web Push (#8) and Email digest (#21) plug in
// later by extending DispatcherDeps.channels.

import type { StoredSignal } from "#/lib/signal";

export type AlertChannel = "slack_dm";
export type AlertThreshold = "new" | "10min";

export type AlertPreferences = {
  enabledChannels: AlertChannel[];
};

export type ChannelSender = (signal: StoredSignal) => Promise<void>;

export type IdempotencyResult = { alreadyRecorded: boolean };

export type DispatcherDeps = {
  loadPreferences: () => Promise<AlertPreferences>;
  recordIdempotency: (
    signalId: string,
    threshold: AlertThreshold,
    channels: AlertChannel[],
  ) => Promise<IdempotencyResult>;
  channels: Partial<Record<AlertChannel, ChannelSender>>;
};

export type DispatchResult =
  | { fired: AlertChannel[]; errors: Record<string, string> }
  | { skipped: "no_channels" | "already_dispatched" | "below_threshold" };

export async function dispatchAlert(
  signal: StoredSignal,
  threshold: AlertThreshold,
  deps: DispatcherDeps,
): Promise<DispatchResult> {
  if (!shouldAlert(signal, threshold)) {
    return { skipped: "below_threshold" };
  }

  const prefs = await deps.loadPreferences();
  const targets = prefs.enabledChannels.filter((c) => deps.channels[c]);
  if (targets.length === 0) return { skipped: "no_channels" };

  const idem = await deps.recordIdempotency(signal.id, threshold, targets);
  if (idem.alreadyRecorded) return { skipped: "already_dispatched" };

  const fired: AlertChannel[] = [];
  const errors: Record<string, string> = {};
  for (const channel of targets) {
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
 * Per-event matrix gating. Kept tiny on purpose for v1 — the proper matrix
 * UI lands with #9 (quiet hours + per-event matrix).
 */
function shouldAlert(signal: StoredSignal, threshold: AlertThreshold): boolean {
  if (threshold === "10min") return signal.kind === "meeting";
  // "new": only requires-action Signals fire on write. Read-only PR poll
  // results, for example, surface in the inbox without pinging.
  return signal.requires_action === true;
}
