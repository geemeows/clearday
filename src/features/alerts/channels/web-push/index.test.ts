import { describe, expect, it, vi } from "vitest";
import { sendWebPush } from "#/features/alerts/channels/web-push";
import type { WebPushDispatcherDeps } from "#/features/alerts/channels/web-push/subscriptions";
import {
  b64urlDecode,
  b64urlEncode,
} from "#/features/alerts/channels/web-push/vapid";
import type { StoredSignal } from "#/shared/signal";

async function vapidConfig() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as {
    x: string;
    y: string;
    d: string;
  };
  const xb = b64urlDecode(jwk.x);
  const yb = b64urlDecode(jwk.y);
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  pub.set(xb, 1);
  pub.set(yb, 33);
  return {
    publicKey: b64urlEncode(pub),
    privateKey: jwk.d,
    subject: "mailto:dev@example.com",
  };
}

const signal: StoredSignal = {
  id: "sig-1",
  provider: "github",
  kind: "pr_review_requested",
  source_id: "pr-1",
  title: "Review me",
  url: "https://github.com/x/y/pull/1",
  payload: {},
  requires_action: true,
  source_created_at: null,
  unread_count: 0,
  created_at: "2026-05-04T00:00:00Z",
  updated_at: "2026-05-04T00:00:00Z",
  dismissed_at: null,
};

describe("sendWebPush", () => {
  it("resolves on at least one delivery", async () => {
    const deps: WebPushDispatcherDeps = {
      vapid: await vapidConfig(),
      loadSubscriptions: async () => [
        { id: "ok", endpoint: "https://x/1", p256dh: "p", auth: "a" },
      ],
      removeSubscription: async () => {},
      stampDelivered: async () => {},
      fetch: vi.fn(
        async () => new Response(null, { status: 201 }),
      ) as unknown as typeof fetch,
    };
    await expect(sendWebPush(signal, deps)).resolves.toBeUndefined();
  });

  it("throws when no subscriptions are registered", async () => {
    const deps: WebPushDispatcherDeps = {
      vapid: await vapidConfig(),
      loadSubscriptions: async () => [],
      removeSubscription: async () => {},
      stampDelivered: async () => {},
      fetch: vi.fn() as unknown as typeof fetch,
    };
    await expect(sendWebPush(signal, deps)).rejects.toThrow(/no web push/);
  });

  it("throws when every delivery errors", async () => {
    const deps: WebPushDispatcherDeps = {
      vapid: await vapidConfig(),
      loadSubscriptions: async () => [
        { id: "broken", endpoint: "https://x/1", p256dh: "p", auth: "a" },
      ],
      removeSubscription: async () => {},
      stampDelivered: async () => {},
      fetch: vi.fn(
        async () => new Response(null, { status: 500 }),
      ) as unknown as typeof fetch,
    };
    await expect(sendWebPush(signal, deps)).rejects.toThrow(/HTTP 500/);
  });

  it("is silent when some pruned and at least one delivered", async () => {
    const responses: Response[] = [
      new Response(null, { status: 410 }),
      new Response(null, { status: 201 }),
    ];
    const deps: WebPushDispatcherDeps = {
      vapid: await vapidConfig(),
      loadSubscriptions: async () => [
        { id: "gone", endpoint: "https://x/1", p256dh: "p", auth: "a" },
        { id: "ok", endpoint: "https://x/2", p256dh: "p", auth: "a" },
      ],
      removeSubscription: async () => {},
      stampDelivered: async () => {},
      fetch: vi.fn(
        async () => responses.shift() as Response,
      ) as unknown as typeof fetch,
    };
    await expect(sendWebPush(signal, deps)).resolves.toBeUndefined();
  });
});
