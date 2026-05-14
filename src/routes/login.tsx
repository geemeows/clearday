// Login route — standalone (outside the app shell).
// Full login UI rebuilt in issue #185.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Spinner } from "#/components/ui/spinner";

export const Route = createFileRoute("/login")({
  beforeLoad({ context }) {
    if (!context.auth.loading && context.auth.allowed) {
      throw redirect({ to: "/today" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { loading } = Route.useRouteContext({ select: (c) => c.auth });

  if (loading) {
    return (
      <main
        style={{
          display: "flex",
          minHeight: "100svh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--background)",
        }}
      >
        <Spinner />
      </main>
    );
  }

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100svh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--background)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden="true"
      >
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>D</span>
      </div>
      <p
        style={{
          fontSize: 14,
          color: "var(--muted-foreground)",
          textAlign: "center",
        }}
      >
        Sign in to continue to Devy.
      </p>
    </main>
  );
}
