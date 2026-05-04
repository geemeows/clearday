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

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
