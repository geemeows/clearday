import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { signInWithGoogle } from "#/lib/auth";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (context.auth.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginComponent,
});

function LoginComponent() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">ClearDay</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your developer command center.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void signInWithGoogle();
          }}
          className="w-full rounded border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
