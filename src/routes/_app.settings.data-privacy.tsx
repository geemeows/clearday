import { createFileRoute } from "@tanstack/react-router";
import { DataPrivacyPanel } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/data-privacy")({
  component: DataPrivacyRoute,
});

function DataPrivacyRoute() {
  return <DataPrivacyPanel />;
}
