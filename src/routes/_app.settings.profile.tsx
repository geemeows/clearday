import { createFileRoute } from "@tanstack/react-router";
import { ProfilePanel } from "#/features/settings/profile/components/ProfilePanel";

export const Route = createFileRoute("/_app/settings/profile")({
  component: ProfileRoute,
});

function ProfileRoute() {
  return <ProfilePanel />;
}
