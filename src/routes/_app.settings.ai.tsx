import { createFileRoute } from "@tanstack/react-router";
import { AIPanel } from "#/features/ai/components/AIPanel";

export const Route = createFileRoute("/_app/settings/ai")({
  component: AiRoute,
});

function AiRoute() {
  return <AIPanel />;
}
