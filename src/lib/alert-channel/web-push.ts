// Web Push alert channel. Wraps `dispatchWebPush` so the alert-dispatcher
// can call it with the same `(signal) => Promise<void>` shape as the other
// channel senders. Throws on full failure (no devices delivered AND every
// device errored) so the dispatcher records this channel as failed; partial
// success is silent.

import {
  dispatchWebPush,
  type WebPushDispatcherDeps,
  type WebPushPayload,
} from "#/lib/web-push-dispatcher";
import type { StoredSignal } from "#/shared/signal";

export function buildWebPushPayload(signal: StoredSignal): WebPushPayload {
  const title = signal.title?.trim() || "New Clearday signal";
  return {
    title,
    body: signal.url || undefined,
    url: signal.url || undefined,
  };
}

export async function sendWebPush(
  signal: StoredSignal,
  deps: WebPushDispatcherDeps,
): Promise<void> {
  const report = await dispatchWebPush(signal, deps);
  const errorCount = Object.keys(report.errors).length;
  const totalAttempted =
    report.delivered.length + report.pruned.length + errorCount;
  if (totalAttempted === 0) {
    throw new Error("no web push subscriptions registered");
  }
  if (report.delivered.length === 0 && errorCount > 0) {
    const first = Object.values(report.errors)[0];
    throw new Error(`all web push deliveries failed: ${first}`);
  }
}
