import { createFileRoute, redirect } from "@tanstack/react-router";
import { apiFetch } from "#/lib/api-client";
import type { OnboardingStatus } from "#/lib/onboarding-api";

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
});
