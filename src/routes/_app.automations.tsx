import { createFileRoute } from "@tanstack/react-router";
import { AutomationsPage } from "#/features/automations/components/AutomationsPage";

export const Route = createFileRoute("/_app/automations")({
  component: AutomationsPageRoute,
});

export function AutomationsPageRoute() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        padding: "24px",
      }}
    >
      <AutomationsPage />
    </main>
  );
}
