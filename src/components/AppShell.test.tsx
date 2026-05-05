import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell, UserMenu } from "#/components/AppShell";
import { PROFILE_UPDATED_EVENT } from "#/lib/profile-api";

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
  it("renders Workspace nav items", async () => {
    await renderShell();
    const nav = await screen.findByRole("navigation", { name: /workspace/i });
    for (const label of ["Today", "Inbox", "Tasks", "Calendar"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("renders Sources rail with neutral status dots", async () => {
    await renderShell();
    const sources = await screen.findByRole("navigation", { name: /sources/i });
    for (const label of [
      "GitHub",
      "Linear",
      "Jira",
      "Slack",
      "Google Calendar",
    ]) {
      expect(within(sources).getByText(label)).toBeTruthy();
    }
    const dots = sources.querySelectorAll('[data-status="neutral"]');
    expect(dots.length).toBe(5);
    // No webhook timestamp known yet -> empty data-last-webhook-at attr.
    for (const dot of Array.from(dots)) {
      expect(dot.getAttribute("data-last-webhook-at")).toBe("");
    }
  });

  it("includes a Settings link", async () => {
    await renderShell();
    expect(await screen.findByRole("link", { name: /settings/i })).toBeTruthy();
  });
});

describe("UserMenu", () => {
  const profile = {
    display_name: "Devy",
    timezone: null,
    locale: null,
    avatar_url: null,
  };

  it("renders the display name from the loader", async () => {
    const loader = vi.fn(async () => profile);
    render(<UserMenu loader={loader} />);
    const menu = await screen.findByRole("status", { name: /user menu/i });
    expect(menu.textContent).toBe("Devy");
  });

  it("falls back to 'Account' when no display name is set", async () => {
    const loader = vi.fn(async () => ({
      display_name: null,
      timezone: null,
      locale: null,
      avatar_url: null,
    }));
    render(<UserMenu loader={loader} />);
    const menu = await screen.findByRole("status", { name: /user menu/i });
    expect(menu.textContent).toBe("Account");
  });

  it("updates immediately when a profile-updated event fires", async () => {
    const loader = vi.fn(async () => profile);
    render(<UserMenu loader={loader} />);
    await screen.findByText("Devy");
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PROFILE_UPDATED_EVENT, {
          detail: { ...profile, display_name: "Renamed" },
        }),
      );
    });
    expect(screen.getByRole("status").textContent).toBe("Renamed");
  });
});
