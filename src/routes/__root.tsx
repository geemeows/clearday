import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "#/features/auth/auth";

export type RouterContext = {
  auth: AuthState;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}
