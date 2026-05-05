import { describe, expect, it, vi } from "vitest";
import {
  type DeviceView,
  deriveDeviceLabel,
  listDevices,
  renameDevice,
  subscribe,
  unsubscribe,
  type WebPushSubscriptionStore,
} from "#/lib/web-push-api";

function memoryStore(initial: DeviceView[] = []): WebPushSubscriptionStore {
  let devices = [...initial];
  let counter = devices.length;
  return {
    list: async () => devices,
    upsert: async (input) => {
      const existing = devices.find((d) => d.endpoint === input.endpoint);
      if (existing) {
        existing.device_label = input.device_label ?? existing.device_label;
        return existing;
      }
      counter += 1;
      const created: DeviceView = {
        id: `dev-${counter}`,
        endpoint: input.endpoint,
        device_label: input.device_label ?? null,
        last_delivered_at: null,
        created_at: "2026-05-04T00:00:00Z",
      };
      devices.push(created);
      return created;
    },
    remove: async (id) => {
      const before = devices.length;
      devices = devices.filter((d) => d.id !== id);
      return { removed: devices.length < before };
    },
    rename: async (id, label) => {
      const target = devices.find((d) => d.id === id);
      if (!target) return { device: null };
      target.device_label = label;
      return { device: target };
    },
  };
}

describe("subscribe", () => {
  it("creates a device with the derived label", async () => {
    const store = memoryStore();
    const result = await subscribe(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "pubkey", auth: "authkey" },
        user_agent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0",
      },
      store,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.device.id).toBe("dev-1");
      expect(result.device.endpoint).toBe(
        "https://fcm.googleapis.com/fcm/send/abc",
      );
      expect(result.device.device_label).toBe("Chrome on macOS");
    }
  });

  it("rejects malformed bodies", async () => {
    const store = memoryStore();
    expect((await subscribe({ endpoint: "http://insecure" }, store)).ok).toBe(
      false,
    );
    expect(
      (
        await subscribe(
          {
            endpoint: "https://x/y",
            keys: { p256dh: "" },
          },
          store,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await subscribe(
          {
            endpoint: "https://x/y",
            keys: { p256dh: "p", auth: "" },
          },
          store,
        )
      ).ok,
    ).toBe(false);
  });

  it("upserts on duplicate endpoint without creating a second device", async () => {
    const store = memoryStore();
    await subscribe(
      {
        endpoint: "https://x/1",
        keys: { p256dh: "p", auth: "a" },
        user_agent: "Mozilla/5.0 (Macintosh) Chrome/130",
      },
      store,
    );
    const second = await subscribe(
      {
        endpoint: "https://x/1",
        keys: { p256dh: "p2", auth: "a2" },
        device_label: "My Mac",
      },
      store,
    );
    expect(second.ok).toBe(true);
    const list = await listDevices(store);
    expect(list.devices).toHaveLength(1);
    if (second.ok) expect(second.device.device_label).toBe("My Mac");
  });
});

describe("unsubscribe", () => {
  it("delegates to the store", async () => {
    const remove = vi.fn(async (_id: string) => ({ removed: true }));
    const result = await unsubscribe("dev-1", {
      list: async () => [],
      upsert: async () => ({}) as DeviceView,
      remove,
      rename: async () => ({ device: null }),
    });
    expect(result).toEqual({ ok: true, removed: true });
    expect(remove).toHaveBeenCalledWith("dev-1");
  });
});

describe("renameDevice", () => {
  it("trims and persists a new label", async () => {
    const store = memoryStore();
    await subscribe(
      {
        endpoint: "https://x/1",
        keys: { p256dh: "p", auth: "a" },
        user_agent: "Mozilla/5.0 (Macintosh) Chrome/130",
      },
      store,
    );
    const list1 = await listDevices(store);
    const id = list1.devices[0].id;
    const result = await renameDevice(
      id,
      { device_label: "  My Mac  " },
      store,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.device.device_label).toBe("My Mac");
  });

  it("rejects empty / non-string / oversize labels", async () => {
    const store = memoryStore();
    expect((await renameDevice("dev-1", { device_label: "" }, store)).ok).toBe(
      false,
    );
    expect(
      (await renameDevice("dev-1", { device_label: "   " }, store)).ok,
    ).toBe(false);
    expect((await renameDevice("dev-1", {}, store)).ok).toBe(false);
    const tooLong = "x".repeat(65);
    expect(
      (await renameDevice("dev-1", { device_label: tooLong }, store)).ok,
    ).toBe(false);
  });

  it("returns 404-style error when the device is missing", async () => {
    const store = memoryStore();
    const result = await renameDevice("nope", { device_label: "Other" }, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toBe("device not found");
    }
  });
});

describe("deriveDeviceLabel", () => {
  it("recognizes common browser/os combinations", () => {
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130",
      ),
    ).toBe("Chrome on macOS");
    expect(
      deriveDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64) Firefox/120"),
    ).toBe("Firefox on Windows");
    expect(
      deriveDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/537"),
    ).toBe("Safari on iOS");
  });

  it("returns null for missing UA", () => {
    expect(deriveDeviceLabel(null)).toBe(null);
    expect(deriveDeviceLabel("")).toBe(null);
  });
});
