import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

function InboxPage() {
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Unified Signals from your sources will land here.
      </p>
    </section>
  );
}
