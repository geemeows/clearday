import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return <SectionHead title="Notifications" comingInIssue={41} />;
}
