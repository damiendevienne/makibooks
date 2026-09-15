import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PasswordResetPage from "./components/PasswordResetPage.jsx";
import EmailConfirmedPage from "./components/EmailConfirmedPage.jsx";
import UnsubscribeEmailPage from "./components/UnsubscribeEmailPage.jsx";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";


const path = window.location.pathname;
const Root = path === "/reset-password" ? PasswordResetPage : path === "/email-confirmed" ? EmailConfirmedPage : path === "/unsubscribe-email" ? UnsubscribeEmailPage : App;
ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
const appLoadingStartedAt = performance.now();
const isInstalledApp = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
requestAnimationFrame(() => {
  if (isInstalledApp) {
    document.getElementById("app-loading")?.remove();
    return;
  }
  const minimumDisplayTime = 650;
  const remaining = Math.max(0, minimumDisplayTime - (performance.now() - appLoadingStartedAt));
  window.setTimeout(() => document.getElementById("app-loading")?.remove(), remaining);
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.clearAppBadge?.();
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").then((registration) => registration.update()).catch(() => {}));
}
