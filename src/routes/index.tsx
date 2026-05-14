import { createFileRoute, redirect } from "@tanstack/react-router";
import { Spinner } from "#/components/ui/spinner";

export const Route = createFileRoute("/")({
  beforeLoad({ context }) {
    if (context.auth.loading) return;
    if (context.auth.allowed) throw redirect({ to: "/today" });
    throw redirect({ to: "/login" });
  },
  component: LoadingPage,
});

function LoadingPage() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100svh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
      }}
    >
      <Spinner />
    </div>
  );
}
