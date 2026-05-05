import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/profile")({
  component: ProfileRoute,
});

function ProfileRoute() {
  return <SectionHead title="Profile" comingInIssue={44} />;
}
