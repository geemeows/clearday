import { createFileRoute } from "@tanstack/react-router";
import { SelfHostPanel } from "#/features/settings/self-host/components/SelfHostPanel";

export const Route = createFileRoute("/_app/settings/selfhost")({
  component: SelfHostRoute,
});

function SelfHostRoute() {
  return <SelfHostPanel />;
}
