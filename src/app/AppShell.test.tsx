import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "#/app/AppShell";
import { OPEN_CMDK_EVENT } from "#/app/NavigationSidebar";

async function renderShell(initial = "/today") {
  const rootRoute = createRootRoute({ component: AppShell });
  const childRoutes = [
    "/today",
    "/inbox",
    "/tasks",
    "/calendar",
    "/settings",
  ].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div data-testid={`page${path}`}>{path}</div>,
    }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(childRoutes),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  // biome-ignore lint/suspicious/noExplicitAny: test-only router cast
  render(<RouterProvider router={router as any} />);
}

describe("AppShell sidebar", () => {
  it("renders the Devy brand wordmark", async () => {
    await renderShell();
    const sidebar = await screen.findByRole("complementary", {
      name: /primary/i,
    });
    expect(within(sidebar).getByText("Devy")).toBeTruthy();
  });

  it("renders Workspace nav buttons", async () => {
    await renderShell();
    const nav = await screen.findByRole("navigation", { name: /workspace/i });
    for (const label of ["Today", "Inbox", "Tasks", "Calendar"]) {
      expect(within(nav).getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("renders Sources rail with neutral dots for every provider", async () => {
    await renderShell();
    const sources = await screen.findByRole("navigation", { name: /sources/i });
    for (const label of [
      "GitHub",
      "Slack",
      "Google Calendar",
      "Linear",
      "Jira",
    ]) {
      expect(within(sources).getByText(label)).toBeTruthy();
    }
    const dots = sources.querySelectorAll('[data-status="neutral"]');
    expect(dots.length).toBe(5);
  });

  it("dispatches devy:open-cmdk when the search trigger is clicked", async () => {
    await renderShell();
    const onEvent = vi.fn();
    window.addEventListener(OPEN_CMDK_EVENT, onEvent);
    try {
      const trigger = await screen.findByRole("button", {
        name: /search anything/i,
      });
      fireEvent.click(trigger);
      expect(onEvent).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_CMDK_EVENT, onEvent);
    }
  });

  it("renders the FocusButton CTA in the focus slot when no session is active", async () => {
    await renderShell();
    const slot = document.querySelector('[data-focus-active="false"]');
    expect(slot).toBeTruthy();
    expect(
      within(slot as HTMLElement).getByRole("button", {
        name: /start focus session/i,
      }),
    ).toBeTruthy();
  });

  it("links the account row's settings cog to the settings page", async () => {
    await renderShell();
    expect(
      await screen.findByRole("button", { name: /^settings$/i }),
    ).toBeTruthy();
  });

  it("opens the FocusModal when the focus trigger is clicked", async () => {
    await renderShell();
    const trigger = await screen.findByRole("button", {
      name: /start focus session/i,
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/start focus session/i)).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: /duration/i })).toBeTruthy();
  });
});
