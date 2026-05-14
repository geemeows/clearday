import { createFileRoute } from "@tanstack/react-router";
import { CareerPage } from "#/features/career/components/CareerPage";

export const Route = createFileRoute("/_app/career")({
  component: () => (
    <main className="flex-1 overflow-auto">
      <CareerPage />
    </main>
  ),
});
