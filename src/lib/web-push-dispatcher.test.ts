import { describe, expect, it, vi } from "vitest";
import {
  dispatchWebPush,
  pruneStaleWebPushSubscriptions,
  STALE_SUBSCRIPTION_DAYS,
  type WebPushDispatcherDeps,
} from "#/lib/web-push-dispatcher";
import { b64urlDecode, b64urlEncode } from "#/lib/web-push-vapid";
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

describe("dispatchWebPush", () => {
  it("signs each request with VAPID and stamps delivered", async () => {
    const vapid = await vapidConfig();
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 201 }),
    );
    const stampDelivered = vi.fn(async () => {});
    const deps: WebPushDispatcherDeps = {
      vapid,
      loadSubscriptions: async () => [
        {
          id: "dev-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          p256dh: "p1",
          auth: "a1",
        },
        {
          id: "dev-2",
          endpoint: "https://updates.push.services.mozilla.com/wpush/v2/xyz",
          p256dh: "p2",
          auth: "a2",
        },
      ],
      removeSubscription: vi.fn(async () => {}),
      stampDelivered,
      fetch: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-05-04T12:00:00Z"),
    };

    const report = await dispatchWebPush(signal, deps);
    expect(report.delivered).toEqual(["dev-1", "dev-2"]);
    expect(report.pruned).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const init1 = fetchImpl.mock.calls[0][1] as RequestInit | undefined;
    const headers = init1?.headers as Record<string, string>;
    expect(headers.authorization.startsWith("vapid t=")).toBe(true);
    expect(headers.authorization).toContain(vapid.publicKey);
    expect(headers.ttl).toBe("60");
    expect(stampDelivered).toHaveBeenCalledWith(
      ["dev-1", "dev-2"],
      new Date("2026-05-04T12:00:00Z"),
    );
  });

  it("prunes subscriptions on 404 / 410", async () => {
    const vapid = await vapidConfig();
    const responses: Response[] = [
      new Response(null, { status: 410 }),
      new Response(null, { status: 404 }),
      new Response(null, { status: 201 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift() as Response);
    const removeSubscription = vi.fn(async () => {});
    const deps: WebPushDispatcherDeps = {
      vapid,
      loadSubscriptions: async () => [
        { id: "gone", endpoint: "https://x/1", p256dh: "p", auth: "a" },
        { id: "missing", endpoint: "https://x/2", p256dh: "p", auth: "a" },
        { id: "ok", endpoint: "https://x/3", p256dh: "p", auth: "a" },
      ],
      removeSubscription,
      stampDelivered: async () => {},
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const report = await dispatchWebPush(signal, deps);
    expect(report.pruned.sort()).toEqual(["gone", "missing"]);
    expect(report.delivered).toEqual(["ok"]);
    expect(removeSubscription).toHaveBeenCalledWith("gone");
    expect(removeSubscription).toHaveBeenCalledWith("missing");
  });

  it("captures non-2xx errors per subscription without rolling back others", async () => {
    const vapid = await vapidConfig();
    const responses: Response[] = [
      new Response(null, { status: 500 }),
      new Response(null, { status: 201 }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift() as Response);
    const deps: WebPushDispatcherDeps = {
      vapid,
      loadSubscriptions: async () => [
        { id: "broken", endpoint: "https://x/1", p256dh: "p", auth: "a" },
        { id: "ok", endpoint: "https://x/2", p256dh: "p", auth: "a" },
      ],
      removeSubscription: async () => {},
      stampDelivered: async () => {},
      fetch: fetchImpl as unknown as typeof fetch,
    };
    const report = await dispatchWebPush(signal, deps);
    expect(report.delivered).toEqual(["ok"]);
    expect(report.errors).toEqual({ broken: "push HTTP 500" });
  });

  it("encrypts the payload per subscription when buildPayload is provided", async () => {
    const vapid = await vapidConfig();
    const uaPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const uaPubRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", uaPair.publicKey),
    );
    const authBytes = crypto.getRandomValues(new Uint8Array(16));

    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 201 }),
    );
    const deps: WebPushDispatcherDeps = {
      vapid,
      loadSubscriptions: async () => [
        {
          id: "dev-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          p256dh: b64urlEncode(uaPubRaw),
          auth: b64urlEncode(authBytes),
        },
      ],
      removeSubscription: vi.fn(async () => {}),
      stampDelivered: vi.fn(async () => {}),
      fetch: fetchImpl as unknown as typeof fetch,
      buildPayload: () => ({
        title: "Review me",
        body: "https://x/1",
        url: "https://x/1",
      }),
    };

    await dispatchWebPush(signal, deps);

    const init = fetchImpl.mock.calls[0][1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(headers["content-type"]).toBe("application/octet-stream");
    expect(init?.body).toBeInstanceOf(Uint8Array);
    const body = init?.body as Uint8Array;
    expect(headers["content-length"]).toBe(String(body.length));
    expect(body[20]).toBe(65);
    expect(body.length).toBeGreaterThan(86 + 16);
  });

  it("returns empty report when there are no subscriptions", async () => {
    const vapid = await vapidConfig();
    const deps: WebPushDispatcherDeps = {
      vapid,
      loadSubscriptions: async () => [],
      removeSubscription: async () => {},
      stampDelivered: vi.fn(async () => {}),
      fetch: vi.fn() as unknown as typeof fetch,
    };
    const report = await dispatchWebPush(signal, deps);
    expect(report).toEqual({ delivered: [], pruned: [], errors: {} });
    expect(deps.stampDelivered).not.toHaveBeenCalled();
  });
});

describe("pruneStaleWebPushSubscriptions", () => {
  it("removes the stale ids returned by the loader and returns them", async () => {
    const removeSubscription = vi.fn(async () => {});
    const loadStaleIds = vi.fn(async () => ["dev-old-1", "dev-old-2"]);
    const now = new Date("2026-05-04T00:00:00Z");
    const report = await pruneStaleWebPushSubscriptions({
      loadStaleIds,
      removeSubscription,
      now: () => now,
    });
    expect(report.pruned).toEqual(["dev-old-1", "dev-old-2"]);
    expect(removeSubscription).toHaveBeenCalledWith("dev-old-1");
    expect(removeSubscription).toHaveBeenCalledWith("dev-old-2");
  });

  it("computes the cutoff as now − staleAfterDays days and forwards it to the loader", async () => {
    const loadStaleIds = vi.fn(async (_cutoff: Date) => [] as string[]);
    const now = new Date("2026-05-04T00:00:00Z");
    await pruneStaleWebPushSubscriptions(
      {
        loadStaleIds,
        removeSubscription: async () => {},
        now: () => now,
      },
      10,
    );
    const cutoff = loadStaleIds.mock.calls[0][0];
    expect(cutoff).toEqual(new Date("2026-04-24T00:00:00Z"));
  });

  it("defaults to STALE_SUBSCRIPTION_DAYS when staleAfterDays is omitted", async () => {
    const loadStaleIds = vi.fn(async (_cutoff: Date) => [] as string[]);
    const now = new Date("2026-05-04T00:00:00Z");
    await pruneStaleWebPushSubscriptions({
      loadStaleIds,
      removeSubscription: async () => {},
      now: () => now,
    });
    const cutoff = loadStaleIds.mock.calls[0][0] as Date;
    const expected = new Date(
      now.getTime() - STALE_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(cutoff).toEqual(expected);
  });

  it("returns an empty list and never calls removeSubscription when nothing is stale", async () => {
    const removeSubscription = vi.fn(async () => {});
    const report = await pruneStaleWebPushSubscriptions({
      loadStaleIds: async () => [],
      removeSubscription,
      now: () => new Date("2026-05-04T00:00:00Z"),
    });
    expect(report.pruned).toEqual([]);
    expect(removeSubscription).not.toHaveBeenCalled();
  });
});
