import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_TASKS, TasksPage } from "#/routes/_app.tasks";

describe("TasksPage", () => {
  it("renders the page heading with the assigned-to-you caption", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const heading = screen.getByRole("heading", { name: "Tasks", level: 1 });
    expect(heading).toBeTruthy();
    expect(
      screen.getByText(/assigned to you · Linear · Sprint 24/),
    ).toBeTruthy();
  });

  it("renders one column per status with the bucket count", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      expect(screen.getByRole("region", { name: label })).toBeTruthy();
    }
    const inProgress = screen.getByRole("region", { name: "In progress" });
    expect(inProgress.textContent).toContain("3");
  });

  it("renders each ticket card with its id, priority, and labels", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const card = screen.getByRole("article", { name: "DEV-441" });
    expect(card.textContent).toContain("DEV-441");
    expect(card.textContent).toContain("P1");
    expect(card.textContent).toContain("security");
    expect(card.textContent).toContain("PR #421");
  });

  it("omits the per-card status select when no onMoveTask handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Status for DEV-441")).toBeNull();
  });

  it("fires onMoveTask with the picked status when the per-card select changes", () => {
    const onMoveTask = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onMoveTask={onMoveTask} />);
    const select = screen.getByLabelText(
      "Status for DEV-441",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("in_progress");
    fireEvent.change(select, { target: { value: "done" } });
    expect(onMoveTask).toHaveBeenCalledWith("DEV-441", "done");
  });

  it("omits the per-card PR input when no onLinkPr handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("PR for DEV-441")).toBeNull();
  });

  it("fires onLinkPr with the typed value when the input is committed", () => {
    const onLinkPr = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onLinkPr={onLinkPr} />);
    const input = screen.getByLabelText(
      "PR for DEV-447",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "#500" } });
    fireEvent.blur(input);
    expect(onLinkPr).toHaveBeenCalledWith("DEV-447", "#500");
  });

  it("fires onLinkPr with null when the input is cleared", () => {
    const onLinkPr = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onLinkPr={onLinkPr} />);
    const input = screen.getByLabelText(
      "PR for DEV-441",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("#421");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onLinkPr).toHaveBeenCalledWith("DEV-441", null);
  });

  it("does not fire onLinkPr when the value is unchanged on blur", () => {
    const onLinkPr = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onLinkPr={onLinkPr} />);
    const input = screen.getByLabelText(
      "PR for DEV-441",
    ) as unknown as HTMLInputElement;
    fireEvent.blur(input);
    expect(onLinkPr).not.toHaveBeenCalled();
  });
});
