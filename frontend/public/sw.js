const CACHE_NAME = "maki-books-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/images/app-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
  ));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || "You have a new Maki Books update." }; }
  const title = payload.title || "Maki Books";
  const options = {
    body: payload.body || "You have a new message.",
    icon: "/images/favicon.png",
    badge: "/images/maki-notification-badge.png",
    color: "#000000",
    data: { conversationId: payload.conversationId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    // Keep this event name compatible with tabs opened before the rename.
    windows.forEach((client) => client.postMessage({ type: "bookmybook-push", conversationId: payload.conversationId || null }));
  }));
  if ("setAppBadge" in self.registration) event.waitUntil(self.registration.setAppBadge(Number(payload.badgeCount) || 1));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const target = conversationId ? `/?conversation=${encodeURIComponent(conversationId)}` : "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((window) => "focus" in window);
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return clients.openWindow(target);
  }));
});
