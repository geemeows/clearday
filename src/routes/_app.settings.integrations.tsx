import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/integrations")({
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  return <SectionHead title="Integrations" comingInIssue={40} />;
}
