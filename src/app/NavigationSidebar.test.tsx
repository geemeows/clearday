import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NavigationSidebar,
  type NavigationSidebarProps,
} from "#/app/NavigationSidebar";

function Icon() {
  return <svg aria-hidden="true" />;
}

function renderSidebar(overrides: Partial<NavigationSidebarProps> = {}) {
  const props: NavigationSidebarProps = {
    pages: [
      { to: "/today", label: "Today", icon: Icon },
      { to: "/inbox", label: "Inbox", icon: Icon },
      { to: "/calendar", label: "Calendar", icon: Icon },
    ],
    page: "/today",
    onPage: vi.fn(),
    inboxBadge: 0,
    sources: [],
    focus: { active: false },
    onStartFocus: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenCmdk: vi.fn(),
    profile: { displayName: null, email: null, avatarUrl: null },
    projects: [],
    projectsOpen: false,
    onToggleProjects: vi.fn(),
    onNavigateToProject: vi.fn(),
    onNewProject: vi.fn(),
    ...overrides,
  };
  render(<NavigationSidebar {...props} />);
  return props;
}

describe("NavigationSidebar", () => {
  it("hides the Inbox badge when count is zero", () => {
    renderSidebar();
    expect(screen.queryByTestId("inbox-badge")).toBeNull();
  });

  it("shows the Inbox badge when inboxBadge > 0", () => {
    renderSidebar({ inboxBadge: 4 });
    const badge = screen.getByTestId("inbox-badge");
    expect(badge.textContent).toBe("4");
  });

  it("marks the current page with aria-current=page", () => {
    renderSidebar({ page: "/inbox" });
    const nav = screen.getByRole("navigation", { name: /workspace/i });
    const inbox = within(nav).getByRole("button", { name: /inbox/i });
    expect(inbox.getAttribute("aria-current")).toBe("page");
    const today = within(nav).getByRole("button", { name: /today/i });
    expect(today.getAttribute("aria-current")).toBeNull();
  });

  it("dispatches onPage when a nav item is clicked", () => {
    const onPage = vi.fn();
    renderSidebar({ onPage });
    const nav = screen.getByRole("navigation", { name: /workspace/i });
    fireEvent.click(within(nav).getByRole("button", { name: /calendar/i }));
    expect(onPage).toHaveBeenCalledWith("/calendar");
  });

  it("dispatches onOpenCmdk when the search button is clicked", () => {
    const onOpenCmdk = vi.fn();
    renderSidebar({ onOpenCmdk });
    fireEvent.click(screen.getByRole("button", { name: /search anything/i }));
    expect(onOpenCmdk).toHaveBeenCalledTimes(1);
  });

  it("renders the start-focus trigger when no session is active", () => {
    renderSidebar();
    const slot = document.querySelector('[data-focus-active="false"]');
    expect(slot).toBeTruthy();
    expect(
      within(slot as HTMLElement).getByRole("button", {
        name: /start focus session/i,
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/focus session active/i)).toBeNull();
  });

  it("dispatches onStartFocus when the focus trigger is clicked", () => {
    const onStartFocus = vi.fn();
    renderSidebar({ onStartFocus });
    fireEvent.click(
      screen.getByRole("button", { name: /start focus session/i }),
    );
    expect(onStartFocus).toHaveBeenCalledTimes(1);
  });

  it("renders the FocusActiveBlock with mm:ss when a session is active", () => {
    renderSidebar({
      focus: { active: true, remainingSeconds: 1500, totalSeconds: 1500 },
    });
    const block = screen.getByLabelText(/focus session active/i);
    expect(block).toBeTruthy();
    expect(within(block).getByLabelText(/time remaining/i).textContent).toBe(
      "25:00",
    );
    expect(
      screen.queryByRole("button", { name: /start focus session/i }),
    ).toBeNull();
  });
});

describe("NavigationSidebar — Projects section", () => {
  it("renders the Projects toggle button", () => {
    renderSidebar();
    const nav = screen.getByRole("navigation", { name: /projects/i });
    expect(within(nav).getByRole("button", { name: /projects/i })).toBeTruthy();
  });

  it("hides the project list when projectsOpen is false", () => {
    renderSidebar({
      projects: [{ id: "p1", name: "My Project" }],
      projectsOpen: false,
    });
    expect(screen.queryByText("My Project")).toBeNull();
  });

  it("shows the project list when projectsOpen is true", () => {
    renderSidebar({
      projects: [
        { id: "p1", name: "My Project" },
        { id: "p2", name: "Sprint 7" },
      ],
      projectsOpen: true,
    });
    expect(screen.getByText("My Project")).toBeTruthy();
    expect(screen.getByText("Sprint 7")).toBeTruthy();
  });

  it("marks the active project with aria-current=page", () => {
    renderSidebar({
      projects: [
        { id: "p1", name: "My Project" },
        { id: "p2", name: "Sprint 7" },
      ],
      projectsOpen: true,
      page: "/projects/p1",
    });
    const projectBtn = screen.getByRole("button", { name: "My Project" });
    expect(projectBtn.getAttribute("aria-current")).toBe("page");
    const otherBtn = screen.getByRole("button", { name: "Sprint 7" });
    expect(otherBtn.getAttribute("aria-current")).toBeNull();
  });

  it("calls onToggleProjects when the Projects toggle is clicked", () => {
    const onToggleProjects = vi.fn();
    renderSidebar({ onToggleProjects });
    const nav = screen.getByRole("navigation", { name: /projects/i });
    fireEvent.click(within(nav).getByRole("button", { name: /projects/i }));
    expect(onToggleProjects).toHaveBeenCalledTimes(1);
  });

  it("calls onNavigateToProject when a project is clicked", () => {
    const onNavigateToProject = vi.fn();
    renderSidebar({
      projects: [{ id: "p1", name: "My Project" }],
      projectsOpen: true,
      onNavigateToProject,
    });
    fireEvent.click(screen.getByRole("button", { name: "My Project" }));
    expect(onNavigateToProject).toHaveBeenCalledWith("p1");
  });

  it("calls onNewProject when New project is clicked", () => {
    const onNewProject = vi.fn();
    renderSidebar({ projectsOpen: true, onNewProject });
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it("shows the New project button when projects list is expanded", () => {
    renderSidebar({ projectsOpen: true });
    expect(screen.getByRole("button", { name: /new project/i })).toBeTruthy();
  });
});
