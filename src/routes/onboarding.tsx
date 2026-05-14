// Onboarding route — standalone (outside the app shell).
// Redirects to /login if the user is not authenticated.
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useAuth } from "#/features/auth/auth";
import { Spinner } from "#/components/ui/spinner";
import { OnboardingFlow } from "#/features/onboarding/components/OnboardingFlow";

export const Route = createFileRoute("/onboarding")({
  beforeLoad({ context }) {
    if (!context.auth.loading && !context.auth.allowed) {
      throw redirect({ to: "/login" });
    }
  },
  component: OnboardingPage,
});

export function OnboardingPage() {
  const { loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <Spinner />
      </main>
    );
  }

  function handleFinish() {
    localStorage.setItem("devy:onboarded", "1");
    void navigate({ to: "/today" });
  }

  return (
    <main
      aria-label="Onboarding"
      style={{
        minHeight: "100svh",
        background:
          "radial-gradient(60% 50% at 50% -10%, color-mix(in oklab, var(--brand-blue) 7%, transparent) 0%, transparent 60%), var(--canvas)",
        color: "var(--ink)",
      }}
    >
      <OnboardingFlow onFinish={handleFinish} />
    </main>
  );
}
