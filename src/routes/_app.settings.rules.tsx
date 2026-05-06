import { createFileRoute } from "@tanstack/react-router";
import { InboxRulesPanel } from "#/features/inbox-rules/components/InboxRulesPanel";

export const Route = createFileRoute("/_app/settings/rules")({
  component: RulesRoute,
});

function RulesRoute() {
  return <InboxRulesPanel />;
}
