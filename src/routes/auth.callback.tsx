// OAuth callback — Supabase with detectSessionInUrl handles the code exchange.
// This route just shows a spinner while auth resolves, then redirects to /.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Spinner } from "#/components/ui/spinner";
import { useAuth } from "#/features/auth/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { loading, allowed } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      void navigate({ to: "/" });
    }
  }, [loading, allowed, navigate]);

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
