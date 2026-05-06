// Web Push dispatcher. Fans a single Signal out to every registered device
// subscription, signs each request with VAPID, and prunes subscriptions the
// push service has rejected as gone (HTTP 404 / 410).
//
// When `buildPayload` is provided, the dispatcher derives a payload per Signal
// (title / body / url) and ships an aes128gcm-encrypted body per RFC 8291. The
// SW reads `event.data.json()` and renders the title verbatim. When omitted,
// the dispatcher falls back to a tickle (empty body) and the SW shows a
// generic "New Clearday signal" notification — the same v1 behavior.

import { encryptWebPushPayload } from "#/features/alerts/channels/web-push/encrypt";
import {
  signVapidAuth,
  type VapidConfig,
} from "#/features/alerts/channels/web-push/vapid";
import type { StoredSignal } from "#/shared/signal";

export type WebPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

export type WebPushDispatcherDeps = {
  vapid: VapidConfig;
  loadSubscriptions: () => Promise<WebPushSubscription[]>;
  removeSubscription: (id: string) => Promise<void>;
  stampDelivered: (ids: string[], at: Date) => Promise<void>;
  fetch: typeof fetch;
  now?: () => Date;
  /** Derive the per-Signal payload to encrypt. Omit for tickle (empty body). */
  buildPayload?: (signal: StoredSignal) => WebPushPayload | null;
};

export type DispatchReport = {
  delivered: string[];
  pruned: string[];
  errors: Record<string, string>;
};

export async function dispatchWebPush(
  signal: StoredSignal,
  deps: WebPushDispatcherDeps,
): Promise<DispatchReport> {
  const subs = await deps.loadSubscriptions();
  const now = (deps.now ?? (() => new Date()))();
  const delivered: string[] = [];
  const pruned: string[] = [];
  const errors: Record<string, string> = {};

  const payload = deps.buildPayload?.(signal) ?? null;
  const plaintext = payload ? JSON.stringify(payload) : null;

  for (const sub of subs) {
    try {
      const { authorization } = await signVapidAuth(sub.endpoint, deps.vapid, {
        now,
      });
      const headers: Record<string, string> = { authorization, ttl: "60" };
      let body: BodyInit | undefined;
      if (plaintext !== null) {
        const ciphertext = await encryptWebPushPayload(
          plaintext,
          sub.p256dh,
          sub.auth,
        );
        headers["content-encoding"] = "aes128gcm";
        headers["content-type"] = "application/octet-stream";
        headers["content-length"] = String(ciphertext.length);
        body = ciphertext as BodyInit;
      }
      const res = await deps.fetch(sub.endpoint, {
        method: "POST",
        headers,
        body,
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
