import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "#/app/AppShell";
import { OPEN_CMDK_EVENT } from "#/app/NavigationSidebar";
import {
  type CardWithProject,
  createCard,
  listAllCards,
  listCards,
  listColumns,
  listProjects,
  type StoredCard,
  type StoredColumn,
  type StoredProject,
} from "#/features/projects/store";

vi.mock("#/features/projects/store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/features/projects/store")>();
  return {
    ...actual,
    listProjects: vi.fn(async (): Promise<StoredProject[]> => []),
    listAllCards: vi.fn(async (): Promise<CardWithProject[]> => []),
    listColumns: vi.fn(async (): Promise<StoredColumn[]> => []),
    listCards: vi.fn(async (): Promise<StoredCard[]> => []),
    createCard: vi.fn(async () => {}),
  };
});

async function renderShell(initial = "/today") {
  const rootRoute = createRootRoute({ component: AppShell });
  const childRoutes = [
    "/today",
    "/inbox",
    "/projects",
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

async function renderShellWithProjectRoute(initial = "/today") {
  const rootRoute = createRootRoute({ component: AppShell });
  const staticRoutes = [
    "/today",
    "/inbox",
    "/projects",
    "/calendar",
    "/settings",
  ].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div data-testid={`page${path}`}>{path}</div>,
    }),
  );
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId",
    component: () => <div data-testid="page-project-board">project board</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([...staticRoutes, projectRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  // biome-ignore lint/suspicious/noExplicitAny: test-only router cast
  render(<RouterProvider router={router as any} />);
  return router;
}

const TEST_PROJECT: StoredProject = {
  id: "proj-1",
  name: "My Project",
  archived: false,
  created_at: "2024-01-01",
};

const TEST_CARD: CardWithProject = {
  id: "card-1",
  project_id: "proj-1",
  column_id: "col-1",
  order: 0,
  title: "Fix login bug",
  body: null,
  priority: null,
  tags: [],
  due_at: null,
  created_at: "2024-01-01",
  project_name: "My Project",
};

const TEST_COLUMN: StoredColumn = {
  id: "col-1",
  project_id: "proj-1",
  name: "To do",
  order: 0,
  wip_limit: null,
};

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
    for (const label of ["Today", "Inbox", "Calendar"]) {
      expect(within(nav).getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("renders the Projects section with a toggle button", async () => {
    await renderShell();
    const projectsNav = await screen.findByRole("navigation", {
      name: /projects/i,
    });
    expect(
      within(projectsNav).getByRole("button", { name: /projects/i }),
    ).toBeTruthy();
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
    expect(
      within(dialog).getByRole("group", { name: /duration/i }),
    ).toBeTruthy();
  });
});

describe("AppShell project commands in Cmd-K palette", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue([TEST_PROJECT]);
    vi.mocked(listAllCards).mockResolvedValue([TEST_CARD]);
    vi.mocked(listColumns).mockResolvedValue([TEST_COLUMN]);
    vi.mocked(listCards).mockResolvedValue([]);
    vi.mocked(createCard).mockResolvedValue(undefined);
  });

  async function openPalette() {
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("dialog", { name: /command palette/i });
  }

  it("shows 'Open {project}' navigation command for each loaded project", async () => {
    await renderShell();
    await openPalette();
    expect(await screen.findByText("Open My Project")).toBeTruthy();
  });

  it("shows 'Open card' navigation command for each loaded card", async () => {
    await renderShell();
    await openPalette();
    expect(await screen.findByText("Fix login bug · My Project")).toBeTruthy();
  });

  it("shows 'New card in {project}' action command for each project", async () => {
    await renderShell();
    await openPalette();
    expect(await screen.findByText("New card in My Project")).toBeTruthy();
  });

  it("typing 'new card' shows only new-card actions and hides project/card nav", async () => {
    await renderShell();
    await openPalette();
    // Wait for commands to load before filtering
    await screen.findByText("Open My Project");
    fireEvent.change(screen.getByLabelText(/search signals/i), {
      target: { value: "new card" },
    });
    await screen.findByText("New card in My Project");
    expect(screen.queryByText("Open My Project")).toBeNull();
    expect(screen.queryByText("Fix login bug · My Project")).toBeNull();
  });

  it("'Open {project}' navigates to the project board", async () => {
    const router = await renderShellWithProjectRoute();
    await openPalette();
    const cmd = await screen.findByText("Open My Project");
    const option = cmd.closest('[role="option"]');
    expect(option).toBeTruthy();
    fireEvent.click(option as Element);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects/proj-1");
    });
  });

  it("'Open card' navigates to the project board with the card detail pane open", async () => {
    const router = await renderShellWithProjectRoute();
    await openPalette();
    const cmd = await screen.findByText("Fix login bug · My Project");
    const option = cmd.closest('[role="option"]');
    expect(option).toBeTruthy();
    fireEvent.click(option as Element);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects/proj-1");
      expect(
        (router.state.location.search as Record<string, string>).card,
      ).toBe("card-1");
    });
  });

  it("'New card in {project}' creates a card in the first column and navigates to the board", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "new-card-id-0000-0000-0000-000000000000" as ReturnType<
        typeof crypto.randomUUID
      >,
    );
    const router = await renderShellWithProjectRoute();
    await openPalette();
    const cmd = await screen.findByText("New card in My Project");
    const option = cmd.closest('[role="option"]');
    expect(option).toBeTruthy();
    fireEvent.click(option as Element);
    await waitFor(() => {
      expect(vi.mocked(createCard)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          project_id: "proj-1",
          column_id: "col-1",
          order: 0,
          title: "New card",
        }),
      );
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects/proj-1");
    });
  });
});
