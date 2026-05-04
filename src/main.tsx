import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "#/lib/auth";
import { router } from "#/router";
import "#/styles.css";

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
