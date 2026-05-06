import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPanel } from "#/features/alerts/components/NotificationsPanel";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return <NotificationsPanel />;
}
