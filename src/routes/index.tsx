import { createFileRoute, redirect } from "@tanstack/react-router";
import type { OnboardingStatus } from "#/features/onboarding/api";
import { apiFetch } from "#/lib/api-client";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.auth.loading) return;
    if (!context.auth.session) {
      throw redirect({ to: "/login" });
    }
    let status: OnboardingStatus | null = null;
    try {
      status = (await apiFetch("/api/onboarding/status")) as OnboardingStatus;
    } catch {
      // Network/api failure shouldn't block the SPA — fall through to /today.
    }
    if (status && !status.onboarded_at && status.providers_connected === 0) {
      throw redirect({ to: "/onboarding" });
    }
    throw redirect({ to: "/today" });
  },
  component: IndexPending,
});

// Rendered only while auth is still resolving — beforeLoad redirects
// in every other case. Without a component, the user sees a blank screen
// until the auth context updates and the router re-evaluates beforeLoad.
function IndexPending() {
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen items-center justify-center"
    />
  );
}
