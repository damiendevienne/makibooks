import api from "./api";

const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "";

function decodeBase64Url(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(`${value.replace(/-/g, "+").replace(/_/g, "/")}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const pushNotificationsAvailable = () => Boolean(
  vapidPublicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
);

export const getNotificationPermission = () => (
  "Notification" in window ? Notification.permission : "denied"
);

export async function enablePushNotifications() {
  if (!pushNotificationsAvailable()) throw new Error("Push notifications are not configured for this site.");
  if (Notification.permission === "denied") {
    throw new Error("Notifications are blocked for Maki Books. Allow them in your browser or phone settings, then try again.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not enabled. You can allow them later in your browser or phone settings.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await api.post("/api/push-subscriptions/unsubscribe", { endpoint: existing.endpoint }).catch(() => {});
    await existing.unsubscribe();
  }
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(vapidPublicKey) });
  await api.post("/api/push-subscriptions", subscription.toJSON());
  localStorage.setItem("pushNotificationsEnabled", "true");
  return subscription;
}

export async function disablePushNotifications() {
  if (!pushNotificationsAvailable()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await api.post("/api/push-subscriptions/unsubscribe", { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  localStorage.removeItem("pushNotificationsEnabled");
}
