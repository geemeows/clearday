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
      { to: "/tasks", label: "Tasks", icon: Icon },
      { to: "/calendar", label: "Calendar", icon: Icon },
    ],
    page: "/today",
    onPage: vi.fn(),
    inboxBadge: 0,
    tasksBadge: 0,
    sources: [],
    focus: { active: false },
    onStartFocus: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenCmdk: vi.fn(),
    profile: { displayName: null, email: null, avatarUrl: null },
    ...overrides,
  };
  render(<NavigationSidebar {...props} />);
  return props;
}

describe("NavigationSidebar", () => {
  it("hides Inbox and Tasks badges when their counts are zero", () => {
    renderSidebar();
    expect(screen.queryByTestId("inbox-badge")).toBeNull();
    expect(screen.queryByTestId("tasks-badge")).toBeNull();
  });

  it("shows the Inbox badge when inboxBadge > 0", () => {
    renderSidebar({ inboxBadge: 4 });
    const badge = screen.getByTestId("inbox-badge");
    expect(badge.textContent).toBe("4");
  });

  it("shows the Tasks badge when tasksBadge > 0", () => {
    renderSidebar({ tasksBadge: 7 });
    const badge = screen.getByTestId("tasks-badge");
    expect(badge.textContent).toBe("7");
  });

  it("marks the current page with aria-current=page", () => {
    renderSidebar({ page: "/inbox" });
    const nav = screen.getByRole("navigation", { name: /workspace/i });
    const inbox = within(nav).getByRole("button", { name: /inbox/i });
    expect(inbox.getAttribute("aria-current")).toBe("page");
    const today = within(nav).getByRole("button", { name: /today/i });
    expect(today.getAttribute("aria-current")).toBeNull();
  });

  it("marks a page active for nested route paths", () => {
    renderSidebar({ page: "/tasks/123" });
    const nav = screen.getByRole("navigation", { name: /workspace/i });
    const tasks = within(nav).getByRole("button", { name: /tasks/i });
    expect(tasks.getAttribute("aria-current")).toBe("page");
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
});
