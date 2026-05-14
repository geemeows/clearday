import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "#/features/settings/components/SettingsPage";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPageRoute,
});

export function SettingsPageRoute() {
  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SettingsPage />
    </main>
  );
}
