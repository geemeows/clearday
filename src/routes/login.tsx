// Login route — standalone (outside the app shell).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuth } from "#/features/auth/auth";
import { Spinner } from "#/components/ui/spinner";
import { AuthBrandSurface } from "#/features/auth/components/AuthBrandSurface";
import { LoginForm } from "#/features/auth/components/LoginForm";

export const Route = createFileRoute("/login")({
  beforeLoad({ context }) {
    if (!context.auth.loading && context.auth.allowed) {
      throw redirect({ to: "/today" });
    }
  },
  component: LoginPage,
});

export function LoginPage() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  return (
    <main
      className="grid h-svh w-screen overflow-hidden max-lg:grid-cols-1"
      style={{ gridTemplateColumns: "1.05fr 1fr" }}
    >
      <AuthBrandSurface />
      <LoginForm />
    </main>
  );
}
