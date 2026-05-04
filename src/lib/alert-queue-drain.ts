// Drains the queued-alert ledger written by alert-dispatcher when the
// quiet-hours decision was `queue_until`. Runs from the Worker's scheduled
// tick alongside the meeting-alert tick. Pure module: callers inject the
// queue lookup, the per-row delete, and a sender that fires the matrix-
// allowed channels for a single Signal.

import {
  type AlertChannel,
  type AlertThreshold,
  type DispatcherDeps,
  fireChannels,
} from "#/lib/alert-dispatcher";
import type { StoredSignal } from "#/lib/signal";

export type QueuedAlert = {
  signal_id: string;
  threshold: AlertThreshold;
  channels: AlertChannel[];
  deliver_at: string;
};

export type AlertQueueDrainDeps = {
  loadDue: (now: Date) => Promise<
    Array<{
      queued: QueuedAlert;
      signal: StoredSignal | null;
    }>
  >;
  removeQueued: (signalId: string, threshold: AlertThreshold) => Promise<void>;
  dispatcher: DispatcherDeps;
  now?: () => Date;
};

export type AlertQueueDrainReport = {
  considered: number;
  delivered: Array<{
    signalId: string;
    fired: AlertChannel[];
    errors: Record<string, string>;
  }>;
  dropped: string[];
};

/**
 * Re-evaluates and fires every queued alert whose `deliver_at` has passed.
 * Dropped if the underlying Signal has been deleted or dismissed in the
 * meantime — the queue is best-effort, the user already moved on.
 */
export async function runAlertQueueDrain(
  deps: AlertQueueDrainDeps,
): Promise<AlertQueueDrainReport> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await deps.loadDue(now);
  const delivered: AlertQueueDrainReport["delivered"] = [];
  const dropped: string[] = [];

  for (const { queued, signal } of due) {
    if (!signal || signal.dismissed_at) {
      await deps.removeQueued(queued.signal_id, queued.threshold);
      dropped.push(queued.signal_id);
      continue;
    }
    const result = await fireChannels(signal, queued.channels, deps.dispatcher);
    await deps.removeQueued(queued.signal_id, queued.threshold);
    delivered.push({
      signalId: queued.signal_id,
      fired: result.fired,
      errors: result.errors,
    });
  }

  return { considered: due.length, delivered, dropped };
}
