import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/rules")({
  component: RulesRoute,
});

function RulesRoute() {
  return <SectionHead title="Inbox rules" comingInIssue={42} />;
}
