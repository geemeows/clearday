import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Signal } from "#/lib/signal";
import { TasksView } from "#/routes/_app.tasks";

const sample = (
  overrides: Partial<Signal & { id: string }> = {},
): Signal & { id: string; dismissed_at: string | null } => ({
  id: "sig-1",
  provider: "linear",
  kind: "ticket_assigned",
  source_id: "ENG-42",
  title: "Implement Tasks page",
  url: "https://linear.app/acme/issue/ENG-42/implement-tasks-page",
  payload: {
    identifier: "ENG-42",
    team_key: "ENG",
    state_name: "Todo",
    priority_label: "High",
  },
  requires_action: true,
  source_created_at: "2026-05-01T10:00:00Z",
  dismissed_at: null,
  ...overrides,
});

describe("TasksView", () => {
  it("renders ticket rows with identifier, title, status and an Open link", () => {
    render(
      <TasksView
        signals={[sample()]}
        filter="all"
        onFilterChange={() => {}}
        error={null}
      />,
    );
    expect(screen.getByText("ENG-42")).toBeTruthy();
    expect(screen.getByText("Implement Tasks page")).toBeTruthy();
    const link = screen.getByRole("link", { name: /open/i });
    expect(link.getAttribute("href")).toBe(
      "https://linear.app/acme/issue/ENG-42/implement-tasks-page",
    );
  });

  it("shows the empty-state copy when no tickets are returned", () => {
    render(
      <TasksView
        signals={[]}
        filter="all"
        onFilterChange={() => {}}
        error={null}
      />,
    );
    expect(screen.getByText(/no assigned tickets/i)).toBeTruthy();
  });

  it("filters rows by status when a non-all chip is selected", () => {
    const inProgress = sample({
      id: "sig-2",
      kind: "ticket_in_progress",
      source_id: "ENG-43",
      title: "Wire cron orchestrator",
      payload: { identifier: "ENG-43", state_name: "In Progress" },
    });
    render(
      <TasksView
        signals={[sample(), inProgress]}
        filter="ticket_in_progress"
        onFilterChange={() => {}}
        error={null}
      />,
    );
    expect(screen.getByText("Wire cron orchestrator")).toBeTruthy();
    expect(screen.queryByText("Implement Tasks page")).toBeNull();
  });

  it("reports filter chip clicks", () => {
    const onFilterChange = vi.fn();
    render(
      <TasksView
        signals={[sample()]}
        filter="all"
        onFilterChange={onFilterChange}
        error={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /In progress/ }));
    expect(onFilterChange).toHaveBeenCalledWith("ticket_in_progress");
  });

  it("renders the loading state when signals is null", () => {
    render(
      <TasksView
        signals={null}
        filter="all"
        onFilterChange={() => {}}
        error={null}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("surfaces an error message", () => {
    render(
      <TasksView
        signals={null}
        filter="all"
        onFilterChange={() => {}}
        error="boom"
      />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
