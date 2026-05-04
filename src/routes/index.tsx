import { createFileRoute, redirect } from "@tanstack/react-router";
import { signOut, useAuth } from "#/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.loading) return;
    if (!context.auth.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: HomeComponent,
});

function HomeComponent() {
  const { session, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!session) return null;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">ClearDay</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Signed in as {session.user.email}
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="mt-4 rounded border px-3 py-1 text-sm"
      >
        Sign out
      </button>
    </main>
  );
}
