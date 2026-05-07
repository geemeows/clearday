import { createFileRoute } from "@tanstack/react-router";
import { AutomationsPanel } from "#/features/automations/components/AutomationsPanel";

export const Route = createFileRoute("/_app/automations")({
  component: AutomationsRoute,
});

function AutomationsRoute() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-8">
      <AutomationsPanel />
    </div>
  );
}
