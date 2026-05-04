import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Calendar</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Week / day / month views and the focus-blocks panel will live here.
      </p>
    </section>
  );
}
