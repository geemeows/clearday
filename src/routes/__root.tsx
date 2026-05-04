import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthState } from "#/lib/auth";

export type RouterContext = {
  auth: AuthState;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return <Outlet />;
}
