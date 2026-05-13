import { RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "#/features/auth/auth";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  THEME_UPDATED_EVENT,
  type ThemeView,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";
import { router } from "#/router";
import "#/styles.css";

// Boot-time + on-update theme application. Reads the saved preference and
// stamps data-theme/data-density on <html>; also subscribes to
// system color-scheme changes so theme="system" tracks the OS live, and to
// the THEME_UPDATED_EVENT so saves in Settings apply without reload.
//
// The pre-paint script in index.html stamps these attributes before CSS runs
// using the THEME_STORAGE_KEY cache; the controller below keeps that cache
// in sync (boot fetch + every update) so the next refresh has fresh data.
const THEME_STORAGE_KEY = "clearday:theme";

function readCachedTheme(): ThemeView | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeView>;
    if (!parsed.theme || !parsed.density) return null;
    return parsed as ThemeView;
  } catch {
    return null;
  }
}

function writeCachedTheme(view: ThemeView): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // localStorage disabled / quota: pre-paint will fall back to defaults.
  }
}

function startThemeController() {
  const root = document.documentElement;
  let view: ThemeView = readCachedTheme() ?? DEFAULT_THEME;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => applyThemeToDocument(view, root, media.matches);
  apply();
  apiFetch("/api/theme")
    .then((body) => {
      view = body as ThemeView;
      writeCachedTheme(view);
      apply();
    })
    .catch(() => {
      // Pre-auth or worker error: keep the cached/default view.
    });
  media.addEventListener("change", apply);
  window.addEventListener(THEME_UPDATED_EVENT, ((e: Event) => {
    view = (e as CustomEvent<ThemeView>).detail;
    writeCachedTheme(view);
    apply();
  }) as EventListener);
}
startThemeController();

function App() {
  const auth = useAuth();
  // TanStack Router caches beforeLoad results — passing a new context prop
  // alone won't re-run route guards. Invalidate when auth transitions out
  // of `loading` so routes like `/` (which short-circuits while loading)
  // re-evaluate and redirect to /login or /today.
  const wasLoading = useRef(auth.loading);
  useEffect(() => {
    if (wasLoading.current && !auth.loading) {
      router.invalidate();
    }
    wasLoading.current = auth.loading;
  }, [auth.loading]);
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
