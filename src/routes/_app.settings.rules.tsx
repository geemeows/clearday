import { createFileRoute } from "@tanstack/react-router";
import { RulesPanel } from "#/components/RulesPanel";

export const Route = createFileRoute("/_app/settings/rules")({
  component: RulesRoute,
});

function RulesRoute() {
  return <RulesPanel />;
}
