// App shell layout route — wraps all authenticated app routes.
// Redirects to /login when the session is not allowed.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "#/app/AppShell";

export const Route = createFileRoute("/_app")({
  beforeLoad({ context }) {
    if (!context.auth.loading && !context.auth.allowed) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
