import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

function TasksPage() {
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Assigned Jira / Linear tickets will appear here.
      </p>
    </section>
  );
}
