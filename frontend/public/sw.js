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
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || "You have a new Maki Books update." }; }
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const hasVisibleWindow = windows.some((client) => client.visibilityState === "visible");

    // Keep this event name compatible with tabs opened before the rename.
    windows.forEach((client) => client.postMessage({ type: "bookmybook-push", conversationId: payload.conversationId || null }));

    // When Maki Books is already visible, the open page displays the update
    // itself. Avoid duplicating it as a system notification.
    if (hasVisibleWindow) return;

    const unreadCount = Number(payload.badgeCount) || 1;
    const grouped = unreadCount > 1;
    await self.registration.showNotification(grouped ? "Maki Books" : (payload.title || "Maki Books"), {
      body: grouped ? `${unreadCount} new messages and updates in Maki Books.` : (payload.body || "You have a new message."),
      icon: "/images/favicon.png",
      badge: "/images/maki-notification-badge.png",
      color: "#000000",
      tag: "maki-books-messages",
      renotify: true,
      data: { conversationId: payload.conversationId || null },
    });
    if ("setAppBadge" in self.registration) await self.registration.setAppBadge(unreadCount);
  })());
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
