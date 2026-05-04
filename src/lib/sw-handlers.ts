// Pure helpers shared with the on-disk service worker (`public/sw.js`).
// The service worker can't import from src/ at runtime (it's loaded by the
// browser as a standalone script), so the SW file duplicates these tiny
// functions verbatim and we test the canonical version here.

export type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

export type NotificationOpts = {
  body: string;
  icon: string;
  data: { url: string };
  tag?: string;
};

/**
 * Decode a push event's data into the (title, options) tuple passed to
 * `registration.showNotification`. Tickle pushes (no data) get a generic
 * "New Clearday signal" copy so the SW always has something to show.
 */
export function buildPushNotification(data: PushPayload | null): {
  title: string;
  options: NotificationOpts;
} {
  const title = data?.title?.trim() || "New Clearday signal";
  const body = data?.body?.trim() || "Open Clearday to see it";
  const url = data?.url || "/";
  return {
    title,
    options: {
      body,
      icon: "/favicon.ico",
      data: { url },
    },
  };
}

/**
 * Resolve the URL to focus / open when a notification is clicked. Falls
 * back to the app's root if the notification didn't carry a `url` hint.
 */
export function notificationClickUrl(
  notificationData: { url?: string } | null | undefined,
): string {
  return notificationData?.url || "/";
}
