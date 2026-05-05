import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPanel } from "#/components/NotificationsPanel";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return <NotificationsPanel />;
}
