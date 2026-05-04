import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "#/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackComponent,
});

function AuthCallbackComponent() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/" : "/login", replace: true });
  }, [loading, session, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-zinc-500">Signing you in…</p>
    </main>
  );
}
