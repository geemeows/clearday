import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/calendar")({
  component: () => <main className="flex-1 overflow-auto p-6" />,
});
