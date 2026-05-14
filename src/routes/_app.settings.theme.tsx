import { createFileRoute } from "@tanstack/react-router";
import { ThemePanel } from "#/routes/_app.settings";

export const Route = createFileRoute("/_app/settings/theme")({
  component: ThemeRoute,
});

function ThemeRoute() {
  return <ThemePanel />;
}
