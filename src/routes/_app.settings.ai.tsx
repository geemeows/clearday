import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/ai")({
  component: AiRoute,
});

function AiRoute() {
  return <SectionHead title="AI provider" comingInIssue={43} />;
}
