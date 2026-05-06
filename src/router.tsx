import { createRouter } from "@tanstack/react-router";
import type { AuthState } from "#/features/auth/auth";
import { routeTree } from "#/routeTree.gen";

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  context: {
    auth: undefined as unknown as AuthState,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
