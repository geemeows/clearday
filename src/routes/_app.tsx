import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "#/app/AppShell";
import { signOut } from "#/features/auth/auth";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.loading) return;
    if (!context.auth.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { rejected, session } = Route.useRouteContext().auth;

  if (rejected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">
            Not authorized for this deployment
          </h1>
          <p className="text-sm text-zinc-500">
            <code>{session?.user.email}</code> isn't the allowed email for this
            ClearDay instance. Sign out and use the owner's account.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return <AppShell />;
}
