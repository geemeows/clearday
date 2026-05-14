import { createFileRoute } from "@tanstack/react-router";
import { WeekStartPanel } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/week-start")({
  component: WeekStartRoute,
});

function WeekStartRoute() {
  return <WeekStartPanel />;
}
