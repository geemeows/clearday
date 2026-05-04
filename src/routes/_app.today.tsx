import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

function TodayPage() {
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Today</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Your morning briefing, in-progress work, schedule, and inbox detail will
        live here.
      </p>
    </section>
  );
}
