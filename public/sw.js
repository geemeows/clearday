// Clearday service worker. Handles Web Push delivery + notification clicks.
// The pure helpers below are duplicated from src/lib/sw-handlers.ts; that
// module is the canonical source and is unit-tested. Keep the two in sync.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = null;
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = null;
    }
  }
  const { title, options } = buildPushNotification(data);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = notificationClickUrl(event.notification.data);
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if (c.url.endsWith(url) && "focus" in c) return c.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});

function buildPushNotification(data) {
  const title =
    (data && typeof data.title === "string" && data.title.trim()) ||
    "New Clearday signal";
  const body =
    (data && typeof data.body === "string" && data.body.trim()) ||
    "Open Clearday to see it";
  const url = (data && data.url) || "/";
  return {
    title,
    options: { body, icon: "/favicon.ico", data: { url } },
  };
}

function notificationClickUrl(notificationData) {
  return (notificationData && notificationData.url) || "/";
}
