import { RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "#/features/auth/auth";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  readCachedTheme,
  THEME_UPDATED_EVENT,
  type ThemeView,
  writeCachedTheme,
} from "#/features/settings/theme/api";
import { apiFetch } from "#/lib/api-client";
import { router } from "#/router";
import "#/styles.css";

// Boot-time + on-update theme application. localStorage is the source of
// truth — the pre-paint script in index.html stamps data-theme/data-density
// from the cache before any CSS runs, and toggles write straight back to it
// (see use-theme.ts). The server is kept in sync best-effort via PUT, but we
// never let a server GET overwrite a local choice; otherwise a slow/stale
// /api/theme response would clobber a fresh toggle on the next refresh.
function startThemeController() {
  const root = document.documentElement;
  const cached = readCachedTheme();
  let view: ThemeView = cached ?? DEFAULT_THEME;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => applyThemeToDocument(view, root, media.matches);
  apply();
  if (!cached) {
    // First load on this device: seed cache from the server preference.
    apiFetch("/api/theme")
      .then((body) => {
        view = body as ThemeView;
        writeCachedTheme(view);
        apply();
      })
      .catch(() => {
        // Pre-auth or worker error: keep defaults.
      });
  }
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
