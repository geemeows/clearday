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

  it("omits the create-task form when no onCreateTask handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByRole("form", { name: "Create task" })).toBeNull();
    expect(screen.queryByLabelText("New task id")).toBeNull();
  });

  it("fires onCreateTask with the entered fields when the form is submitted", () => {
    const onCreateTask = vi.fn();
    render(
      <TasksPage tasks={FIXTURE_TASKS} onCreateTask={onCreateTask} />,
    );
    fireEvent.change(screen.getByLabelText("New task id"), {
      target: { value: "DEV-500" },
    });
    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "Privacy redactor patterns" },
    });
    fireEvent.change(screen.getByLabelText("New task priority"), {
      target: { value: "P2" },
    });
    fireEvent.change(screen.getByLabelText("New task status"), {
      target: { value: "review" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Create task" }) as HTMLFormElement,
    );
    expect(onCreateTask).toHaveBeenCalledWith({
      id: "DEV-500",
      title: "Privacy redactor patterns",
      p: "P2",
      status: "review",
      days: 0,
      pr: null,
      labels: [],
      assignee: null,
    });
  });

  it("omits the per-card delete button when no onDeleteTask handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Delete DEV-441")).toBeNull();
  });

  it("fires onDeleteTask with the card id when the delete button is clicked", () => {
    const onDeleteTask = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onDeleteTask={onDeleteTask} />);
    fireEvent.click(screen.getByLabelText("Delete DEV-441"));
    expect(onDeleteTask).toHaveBeenCalledWith("DEV-441");
  });

  it("omits the per-card assignee input when no onAssign handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Assignee for DEV-441")).toBeNull();
  });

  it("fires onAssign with the typed value when the assignee input is committed", () => {
    const onAssign = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onAssign={onAssign} />);
    const input = screen.getByLabelText(
      "Assignee for DEV-447",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "alice" } });
    fireEvent.blur(input);
    expect(onAssign).toHaveBeenCalledWith("DEV-447", "alice");
  });

  it("fires onAssign with null when the assignee input is cleared", () => {
    const onAssign = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onAssign={onAssign} />);
    const input = screen.getByLabelText(
      "Assignee for DEV-441",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("you");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onAssign).toHaveBeenCalledWith("DEV-441", null);
  });

  it("does not fire onCreateTask when the id or title is empty", () => {
    const onCreateTask = vi.fn();
    render(
      <TasksPage tasks={FIXTURE_TASKS} onCreateTask={onCreateTask} />,
    );
    fireEvent.submit(
      screen.getByRole("form", { name: "Create task" }) as HTMLFormElement,
    );
    expect(onCreateTask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("New task id"), {
      target: { value: "DEV-500" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Create task" }) as HTMLFormElement,
    );
    expect(onCreateTask).not.toHaveBeenCalled();
  });
});
