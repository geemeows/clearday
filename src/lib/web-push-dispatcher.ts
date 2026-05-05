// Web Push dispatcher. Fans a single Signal out to every registered device
// subscription, signs each request with VAPID, and prunes subscriptions the
// push service has rejected as gone (HTTP 404 / 410).
//
// V1 sends *tickle* notifications (empty body) — the Service Worker shows a
// generic notification on push. Encrypted aes128gcm payloads (RFC 8291) are
// a follow-up; the wire shape here already accommodates them since `send`
// sets Content-Encoding only when a body is provided.

import type { StoredSignal } from "#/lib/signal";
import { signVapidAuth, type VapidConfig } from "#/lib/web-push-vapid";

export type WebPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushDispatcherDeps = {
  vapid: VapidConfig;
  loadSubscriptions: () => Promise<WebPushSubscription[]>;
  removeSubscription: (id: string) => Promise<void>;
  stampDelivered: (ids: string[], at: Date) => Promise<void>;
  fetch: typeof fetch;
  now?: () => Date;
};

export type DispatchReport = {
  delivered: string[];
  pruned: string[];
  errors: Record<string, string>;
};

export async function dispatchWebPush(
  _signal: StoredSignal,
  deps: WebPushDispatcherDeps,
): Promise<DispatchReport> {
  const subs = await deps.loadSubscriptions();
  const now = (deps.now ?? (() => new Date()))();
  const delivered: string[] = [];
  const pruned: string[] = [];
  const errors: Record<string, string> = {};

  for (const sub of subs) {
    try {
      const { authorization } = await signVapidAuth(sub.endpoint, deps.vapid, {
        now,
      });
      const res = await deps.fetch(sub.endpoint, {
        method: "POST",
        headers: {
          authorization,
          ttl: "60",
        },
      });
      if (res.status === 404 || res.status === 410) {
        await deps.removeSubscription(sub.id);
        pruned.push(sub.id);
        continue;
      }
      if (!res.ok) {
        errors[sub.id] = `push HTTP ${res.status}`;
        continue;
      }
      delivered.push(sub.id);
    } catch (err) {
      errors[sub.id] = err instanceof Error ? err.message : String(err);
    }
  }

  if (delivered.length > 0) {
    await deps.stampDelivered(delivered, now);
  }

  return { delivered, pruned, errors };
}

// Long-silence prune. The dispatcher already drops 404 / 410 endpoints inline,
// but a subscription whose push service has gone quiet without ever rejecting
// (Chrome devices uninstalled offline, FCM endpoints that never see another
// fan-out, etc.) lingers forever and clutters the device list. This tick
// removes rows that haven't received a push in `staleAfterDays` — measured
// against `last_delivered_at`, falling back to `created_at` for rows that
// never delivered at all.

export const STALE_SUBSCRIPTION_DAYS = 30;

export type PruneStaleSubscriptionsDeps = {
  loadStaleIds: (cutoff: Date) => Promise<string[]>;
  removeSubscription: (id: string) => Promise<void>;
  now?: () => Date;
};

export async function pruneStaleWebPushSubscriptions(
  deps: PruneStaleSubscriptionsDeps,
  staleAfterDays: number = STALE_SUBSCRIPTION_DAYS,
): Promise<{ pruned: string[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const cutoff = new Date(now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000);
  const ids = await deps.loadStaleIds(cutoff);
  for (const id of ids) {
    await deps.removeSubscription(id);
  }
  return { pruned: ids };
}
