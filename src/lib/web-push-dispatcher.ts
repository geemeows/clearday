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
