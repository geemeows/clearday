import { createFileRoute } from "@tanstack/react-router";
import { SectionHead } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/selfhost")({
  component: SelfHostRoute,
});

function SelfHostRoute() {
  return <SectionHead title="Self-host" comingInIssue={44} />;
}
