import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { apiFetch } from "#/lib/api-client";
import { AuthProvider, useAuth } from "#/lib/auth";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/lib/theme-api";
import { router } from "#/router";
import "#/styles.css";

// Boot-time + on-update theme application. Reads the saved preference and
// stamps data-theme/data-density/data-accent on <html>; also subscribes to
// system color-scheme changes so theme="system" tracks the OS live, and to
// the THEME_UPDATED_EVENT so saves in Settings apply without reload.
function startThemeController() {
  const root = document.documentElement;
  let view: ThemeView = DEFAULT_THEME;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => applyThemeToDocument(view, root, media.matches);
  apply();
  apiFetch("/api/theme")
    .then((body) => {
      view = body as ThemeView;
      apply();
    })
    .catch(() => {
      // Pre-auth or worker error: leave defaults applied.
    });
  media.addEventListener("change", apply);
  window.addEventListener(THEME_UPDATED_EVENT, ((e: Event) => {
    view = (e as CustomEvent<ThemeView>).detail;
    apply();
  }) as EventListener);
}
startThemeController();

function App() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

if ("serviceWorker" in navigator) {
  // Register the PWA / Web Push service worker. Failures are non-fatal: the
  // app stays usable; only push notifications won't work until SW registers.
  navigator.serviceWorker
    .register("/sw.js")
    .catch((err) => console.warn("[sw] registration failed", err));
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
