// HTTP-handler logic for /api/push/subscribe (POST/DELETE/GET). Pure against
// an injected `WebPushSubscriptionStore`; the Worker entry plumbs Supabase.
//
// POST body:
//   { endpoint, keys: { p256dh, auth }, user_agent? }
// Returns the freshly-stored DeviceView (id + label + last_delivered_at).

export type DeviceView = {
  id: string;
  endpoint: string;
  device_label: string | null;
  last_delivered_at: string | null;
  created_at: string;
};

export type WebPushSubscriptionStore = {
  list: () => Promise<DeviceView[]>;
  upsert: (input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string | null;
    device_label?: string | null;
  }) => Promise<DeviceView>;
  remove: (id: string) => Promise<{ removed: boolean }>;
  rename: (id: string, label: string) => Promise<{ device: DeviceView | null }>;
};

export const MAX_DEVICE_LABEL_LENGTH = 64;

export type SubscribeBody = {
  endpoint?: unknown;
  keys?: unknown;
  user_agent?: unknown;
  device_label?: unknown;
};

export type SubscribeResult =
  | { ok: true; device: DeviceView }
  | { ok: false; error: string };

export async function subscribe(
  body: SubscribeBody,
  store: WebPushSubscriptionStore,
): Promise<SubscribeResult> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  if (
    typeof body.endpoint !== "string" ||
    !body.endpoint.startsWith("https://")
  ) {
    return { ok: false, error: "endpoint must be an https:// URL" };
  }
  const keys = body.keys as { p256dh?: unknown; auth?: unknown } | null;
  if (!keys || typeof keys !== "object") {
    return { ok: false, error: "keys must be an object" };
  }
  if (typeof keys.p256dh !== "string" || keys.p256dh.length === 0) {
    return { ok: false, error: "keys.p256dh must be a string" };
  }
  if (typeof keys.auth !== "string" || keys.auth.length === 0) {
    return { ok: false, error: "keys.auth must be a string" };
  }

  const userAgent =
    typeof body.user_agent === "string" ? body.user_agent : null;
  const requestedLabel =
    typeof body.device_label === "string" && body.device_label.trim().length > 0
      ? body.device_label.trim()
      : null;
  const device = await store.upsert({
    endpoint: body.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent,
    device_label: requestedLabel ?? deriveDeviceLabel(userAgent),
  });
  return { ok: true, device };
}

export async function unsubscribe(
  id: string,
  store: WebPushSubscriptionStore,
): Promise<{ ok: true; removed: boolean }> {
  const result = await store.remove(id);
  return { ok: true, removed: result.removed };
}

export async function listDevices(
  store: WebPushSubscriptionStore,
): Promise<{ devices: DeviceView[] }> {
  return { devices: await store.list() };
}

export type RenameBody = { device_label?: unknown };

export type RenameResult =
  | { ok: true; device: DeviceView }
  | { ok: false; error: string; status?: number };

export async function renameDevice(
  id: string,
  body: RenameBody,
  store: WebPushSubscriptionStore,
): Promise<RenameResult> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be an object" };
  }
  if (typeof body.device_label !== "string") {
    return { ok: false, error: "device_label must be a string" };
  }
  const label = body.device_label.trim();
  if (label.length === 0) {
    return { ok: false, error: "device_label must not be empty" };
  }
  if (label.length > MAX_DEVICE_LABEL_LENGTH) {
    return {
      ok: false,
      error: `device_label must be at most ${MAX_DEVICE_LABEL_LENGTH} characters`,
    };
  }
  const result = await store.rename(id, label);
  if (!result.device) {
    return { ok: false, error: "device not found", status: 404 };
  }
  return { ok: true, device: result.device };
}

/**
 * Best-effort UA → "Browser on OS" label. Not authoritative — users can
 * rename a device from Settings later. Kept inline to avoid pulling in a
 * UA-parser dependency for a label string.
 */
export function deriveDeviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = matchBrowser(userAgent);
  const os = matchOs(userAgent);
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? null;
}

function matchBrowser(ua: string): string | null {
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

function matchOs(ua: string): string | null {
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}
