import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPanel } from "#/features/integrations/components/IntegrationsPanel";

export const Route = createFileRoute("/_app/settings/integrations")({
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  return <IntegrationsPanel />;
}
