import { createFileRoute } from "@tanstack/react-router";
import { CareerLegendPanel } from "#/features/career/components/CareerLegendPanel";

export const Route = createFileRoute("/_app/settings/career")({
  component: CareerSettingsRoute,
});

function CareerSettingsRoute() {
  return <CareerLegendPanel />;
}
