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

  it("counts only assignee=you tasks in the heading caption", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const assignedToYou = FIXTURE_TASKS.filter(
      (t) => t.assignee === "you",
    ).length;
    expect(
      screen.getByText(
        new RegExp(`${assignedToYou} assigned to you · Linear · Sprint 24`),
      ),
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

  it("omits the per-card priority select when no onSetPriority handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Priority for DEV-441")).toBeNull();
  });

  it("fires onSetPriority with the picked priority when the per-card select changes", () => {
    const onSetPriority = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetPriority={onSetPriority} />);
    const select = screen.getByLabelText(
      "Priority for DEV-441",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("P1");
    fireEvent.change(select, { target: { value: "P2" } });
    expect(onSetPriority).toHaveBeenCalledWith("DEV-441", "P2");
  });

  it("omits the per-card title input when no onSetTitle handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Title for DEV-441")).toBeNull();
  });

  it("fires onSetTitle with the trimmed value when the title input is committed", () => {
    const onSetTitle = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetTitle={onSetTitle} />);
    const input = screen.getByLabelText(
      "Title for DEV-441",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe(
      "Add timestamp-replay rejection to slack-webhook",
    );
    fireEvent.change(input, { target: { value: "Reject replays" } });
    fireEvent.blur(input);
    expect(onSetTitle).toHaveBeenCalledWith("DEV-441", "Reject replays");
  });

  it("does not fire onSetTitle when the title is unchanged or empty", () => {
    const onSetTitle = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetTitle={onSetTitle} />);
    const input = screen.getByLabelText(
      "Title for DEV-441",
    ) as unknown as HTMLInputElement;
    fireEvent.blur(input);
    expect(onSetTitle).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onSetTitle).not.toHaveBeenCalled();
  });

  it("omits the per-card labels input when no onSetLabels handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Labels for DEV-441")).toBeNull();
  });

  it("fires onSetLabels with the parsed comma-separated values on commit", () => {
    const onSetLabels = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetLabels={onSetLabels} />);
    const input = screen.getByLabelText(
      "Labels for DEV-441",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("security");
    fireEvent.change(input, { target: { value: "security, infra" } });
    fireEvent.blur(input);
    expect(onSetLabels).toHaveBeenCalledWith("DEV-441", ["security", "infra"]);
  });

  it("fires onSetLabels with an empty array when the labels input is cleared", () => {
    const onSetLabels = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetLabels={onSetLabels} />);
    const input = screen.getByLabelText(
      "Labels for DEV-441",
    ) as unknown as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onSetLabels).toHaveBeenCalledWith("DEV-441", []);
  });

  it("does not fire onSetLabels when the labels are unchanged on blur", () => {
    const onSetLabels = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetLabels={onSetLabels} />);
    const input = screen.getByLabelText(
      "Labels for DEV-441",
    ) as unknown as HTMLInputElement;
    fireEvent.blur(input);
    expect(onSetLabels).not.toHaveBeenCalled();
  });

  it("omits the per-card days input when no onSetDays handler is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Days for DEV-441")).toBeNull();
  });

  it("fires onSetDays with the parsed number when the days input is committed", () => {
    const onSetDays = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetDays={onSetDays} />);
    const input = screen.getByLabelText(
      "Days for DEV-441",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("1");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.blur(input);
    expect(onSetDays).toHaveBeenCalledWith("DEV-441", 4);
  });

  it("does not fire onSetDays when the value is unchanged or invalid", () => {
    const onSetDays = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onSetDays={onSetDays} />);
    const input = screen.getByLabelText(
      "Days for DEV-441",
    ) as unknown as HTMLInputElement;
    fireEvent.blur(input);
    expect(onSetDays).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "not-a-number" } });
    fireEvent.blur(input);
    expect(onSetDays).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "-2" } });
    fireEvent.blur(input);
    expect(onSetDays).not.toHaveBeenCalled();
  });

  it("moves a task to the dropped column when onMoveTask is provided", () => {
    const onMoveTask = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onMoveTask={onMoveTask} />);
    const card = screen.getByRole("article", { name: "DEV-441" });
    expect((card as HTMLElement).getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(card);
    const todoColumn = screen.getByRole("region", { name: "To do" });
    fireEvent.dragOver(todoColumn);
    fireEvent.drop(todoColumn);
    expect(onMoveTask).toHaveBeenCalledWith("DEV-441", "todo");
  });

  it("moves a task with ArrowRight / ArrowLeft on the focused card", () => {
    const onMoveTask = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onMoveTask={onMoveTask} />);
    const card = screen.getByRole("article", { name: "DEV-441" });
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(onMoveTask).toHaveBeenLastCalledWith("DEV-441", "review");
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    expect(onMoveTask).toHaveBeenLastCalledWith("DEV-441", "todo");
  });

  it("does not move past the first or last column with keyboard arrows", () => {
    const onMoveTask = vi.fn();
    render(<TasksPage tasks={FIXTURE_TASKS} onMoveTask={onMoveTask} />);
    // DEV-432 is in "todo" (first column) — ArrowLeft is a no-op.
    fireEvent.keyDown(screen.getByRole("article", { name: "DEV-432" }), {
      key: "ArrowLeft",
    });
    // DEV-360 is in "done" (last column) — ArrowRight is a no-op.
    fireEvent.keyDown(screen.getByRole("article", { name: "DEV-360" }), {
      key: "ArrowRight",
    });
    expect(onMoveTask).not.toHaveBeenCalled();
  });

  it("makes cards non-draggable and non-focusable when no onMoveTask is provided", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const card = screen.getByRole("article", { name: "DEV-441" });
    expect((card as HTMLElement).getAttribute("draggable")).toBe("false");
    expect((card as HTMLElement).getAttribute("tabindex")).toBeNull();
  });

  it("renders the empty-state message with create-form copy when tasks is empty", () => {
    render(<TasksPage tasks={[]} onCreateTask={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks yet.");
    expect(status.textContent).toContain(
      "Use the form above to create your first task.",
    );
  });

  it("omits the form-pointer copy when no onCreateTask handler is provided", () => {
    render(<TasksPage tasks={[]} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks yet.");
    expect(status.textContent).not.toContain("Use the form above");
  });

  it("does not render the empty-state message when tasks are present", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the assigned-to-you caption as a toggle button defaulting to off", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const toggle = screen.getByRole("button", {
      name: "Show only tasks assigned to you",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("filters tasks to assignee=you when the toggle is pressed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const toggle = screen.getByRole("button", {
      name: "Show only tasks assigned to you",
    });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // DEV-441 + DEV-360 are the only assignee="you" fixtures.
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).toBeNull();
    // Column counts reflect the filter.
    expect(
      screen.getByRole("region", { name: "In progress" }).textContent,
    ).toContain("1");
    expect(
      screen.getByRole("region", { name: "Done this week" }).textContent,
    ).toContain("1");
  });

  it("restores all tasks when the assigned-to-you toggle is pressed again", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const toggle = screen.getByRole("button", {
      name: "Show only tasks assigned to you",
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("article", { name: "DEV-447" })).not.toBeNull();
  });

  it("shows the mine-only empty-state when the filter has no matches", () => {
    const noneAssigned = FIXTURE_TASKS.map((t) => ({ ...t, assignee: null }));
    render(<TasksPage tasks={noneAssigned} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show only tasks assigned to you" }),
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks assigned to you.");
  });

  it("filters tasks by id substring when the filter input is typed into", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const input = screen.getByLabelText("Filter tasks") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "DEV-44" } });
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).toBeNull();
  });

  it("filters tasks by title substring (case-insensitive)", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const input = screen.getByLabelText("Filter tasks") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "calendar" } });
    expect(screen.queryByRole("article", { name: "DEV-378" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
  });

  it("composes the filter with the assigned-to-you toggle", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show only tasks assigned to you" }),
    );
    fireEvent.change(screen.getByLabelText("Filter tasks"), {
      target: { value: "auth" },
    });
    // DEV-360 (assignee=you) matches "auth"; DEV-441 (assignee=you) does not.
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
  });

  it("shows the filter empty-state when no tasks match the query", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter tasks"), {
      target: { value: "xxxxxxx-no-match" },
    });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("filters tasks by priority when the priority select changes", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by priority",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "P1" } });
    // Only P1 tasks remain visible (DEV-441 + DEV-360).
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).toBeNull();
  });

  it("composes the priority filter with the assigned-to-you toggle", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show only tasks assigned to you" }),
    );
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    // No assignee=you task is P2 in the fixture.
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("shows the filter empty-state when no tasks match the priority filter", () => {
    render(<TasksPage tasks={[FIXTURE_TASKS[1]]} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    // The single P2 task doesn't match P1.
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("filters tasks by label when the label select changes", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by label",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "security" } });
    // Only the two "security"-labeled tasks remain (DEV-441 + DEV-360).
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
  });

  it("composes the label filter with the priority filter", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by label"), {
      target: { value: "security" },
    });
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    // No security-labeled task is P2 in the fixture.
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("populates the label filter options from the tasks' labels", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by label",
    ) as unknown as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values[0]).toBe("all");
    const expected = Array.from(
      new Set(FIXTURE_TASKS.flatMap((t) => t.labels)),
    ).sort();
    for (const l of expected) {
      expect(values).toContain(l);
    }
  });

  it("filters tasks to only those with a PR when Has PR is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by PR",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "with" } });
    // PR-linked fixture tasks remain visible.
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).not.toBeNull();
    // Tasks without a PR are hidden.
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).toBeNull();
  });

  it("filters tasks to only those without a PR when No PR is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by PR"), {
      target: { value: "without" },
    });
    expect(screen.queryByRole("article", { name: "DEV-447" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).toBeNull();
  });

  it("composes the PR filter with the priority filter for the empty-state", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by PR"), {
      target: { value: "without" },
    });
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    // No P1 fixture task lacks a PR.
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("filters tasks to those with days >= 3 when the days filter is ≥3d", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by days",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "3" } });
    // Stale (days >= 3) in the fixture: DEV-447 (3d), DEV-401 (6d), DEV-360 (4d).
    expect(screen.queryByRole("article", { name: "DEV-447" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    // Fresher tasks are hidden.
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-378" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).toBeNull();
  });

  it("shows the filter empty-state when the days filter has no matches", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "7" },
    });
    // No fixture task has days >= 7.
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("composes the days filter with the priority filter", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    // Only DEV-360 is P1 with days >= 3.
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-401" })).toBeNull();
  });

  it("filters tasks to unassigned when the assignee filter is Unassigned", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const select = screen.getByLabelText(
      "Filter by assignee",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "unassigned" } });
    // Cards with assignee=null in the fixture: DEV-447, DEV-401, DEV-432,
    // DEV-455, DEV-460, DEV-388, DEV-378.
    expect(screen.queryByRole("article", { name: "DEV-447" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).not.toBeNull();
    // assigned-to-you fixtures are hidden.
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).toBeNull();
  });

  it("filters tasks to a single assignee when picked in the assignee filter", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by assignee"), {
      target: { value: "you" },
    });
    // Only assignee=you fixtures: DEV-441, DEV-360.
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-360" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-447" })).toBeNull();
  });

  it("composes the assignee filter with the priority filter for the empty-state", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by assignee"), {
      target: { value: "you" },
    });
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    // No P2 fixture task is assigned to you.
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("No tasks match your filter.");
  });

  it("hides the Clear filters button when no filter is active", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("shows the Clear filters button once any filter is active", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeNull();
  });

  it("resets all four filters when Clear filters is clicked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show only tasks assigned to you" }),
    );
    fireEvent.change(screen.getByLabelText("Filter tasks"), {
      target: { value: "auth" },
    });
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    fireEvent.change(screen.getByLabelText("Filter by label"), {
      target: { value: "security" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      (screen.getByLabelText("Filter tasks") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Filter by priority") as unknown as HTMLSelectElement).value,
    ).toBe("all");
    expect(
      (screen.getByLabelText("Filter by label") as unknown as HTMLSelectElement).value,
    ).toBe("all");
    expect(
      screen
        .getByRole("button", { name: "Show only tasks assigned to you" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("renders cards in default insertion order when sortBy is default", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(ids).toEqual(["DEV-441", "DEV-447", "DEV-401"]);
  });

  it("sorts cards by priority (P1 first) when Sort by priority is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "priority" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(ids).toEqual(["DEV-441", "DEV-447", "DEV-401"]);
  });

  it("sorts cards by days descending when Sort by days is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "days" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // DEV-401 (6d), DEV-447 (3d), DEV-441 (1d)
    expect(ids).toEqual(["DEV-401", "DEV-447", "DEV-441"]);
  });

  it("sorts cards alphabetically by id when Sort by id is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "id" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(ids).toEqual(["DEV-401", "DEV-441", "DEV-447"]);
  });

  it("sorts cards alphabetically by title when Sort by title is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "title" },
    });
    const review = screen.getByRole("region", { name: "In review" });
    const ids = Array.from(review.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // DEV-378 ("Calendar adapter..."), DEV-388 ("Onboarding...")
    expect(ids).toEqual(["DEV-378", "DEV-388"]);
  });

  it("sorts cards by assignee (nulls last) when Sort by assignee is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "assignee" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // DEV-441 has assignee="you"; DEV-447, DEV-401 are null (stable order).
    expect(ids).toEqual(["DEV-441", "DEV-447", "DEV-401"]);
  });

  it("sorts cards by pr (nulls last) when Sort by PR is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "pr" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // DEV-401 pr="#410", DEV-441 pr="#421", DEV-447 pr=null (nulls last).
    expect(ids).toEqual(["DEV-401", "DEV-441", "DEV-447"]);
  });

  it("sorts cards by label (nulls last) when Sort by label is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "label" },
    });
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // DEV-447 "infra", DEV-401 "perf", DEV-441 "security" — alphabetic asc.
    expect(ids).toEqual(["DEV-447", "DEV-401", "DEV-441"]);
  });

  it("hides the sort-direction toggle when sortBy is default", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(
      screen.queryByRole("button", { name: "Toggle sort direction" }),
    ).toBeNull();
  });

  it("reveals the sort-direction toggle when a non-default sort is picked", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "id" },
    });
    const toggle = screen.getByRole("button", {
      name: "Toggle sort direction",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("reverses the sort order when the direction toggle is pressed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "id" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle sort direction" }),
    );
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(ids).toEqual(["DEV-447", "DEV-441", "DEV-401"]);
  });

  it("reverses the days sort (default desc) into ascending when toggled", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Sort tasks"), {
      target: { value: "days" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle sort direction" }),
    );
    const inProgress = screen.getByRole("region", { name: "In progress" });
    const ids = Array.from(inProgress.querySelectorAll("article")).map((n) =>
      n.getAttribute("aria-label"),
    );
    // ascending toggle flips the default desc: 1d, 3d, 6d
    expect(ids).toEqual(["DEV-441", "DEV-447", "DEV-401"]);
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

  it("hides the visible-count caption when no filter is active", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByLabelText("Visible task count")).toBeNull();
  });

  it("shows the visible-count caption with X of Y when a filter narrows tasks", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    const caption = screen.getByLabelText("Visible task count");
    const visible = FIXTURE_TASKS.filter((t) => t.p === "P1").length;
    expect(caption.textContent).toBe(`${visible} of ${FIXTURE_TASKS.length}`);
  });

  it("renders an expanded collapse toggle per column by default", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      const button = screen.getByRole("button", { name: `Collapse ${label}` });
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("hides cards in a column when its collapse toggle is pressed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse In progress" }),
    );
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    const inProgress = screen.getByRole("region", { name: "In progress" });
    expect(inProgress.textContent).toContain("3");
    expect(
      screen.getByRole("button", { name: "Collapse In progress" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("restores cards when the collapse toggle is pressed again", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const toggle = screen.getByRole("button", { name: "Collapse In progress" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("collapses every column when the Collapse all button is pressed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).not.toBeNull();
    const toggle = screen.getByRole("button", { name: "Collapse all columns" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("Collapse all");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.textContent).toBe("Expand all");
    expect(screen.queryByRole("article", { name: "DEV-441" })).toBeNull();
    expect(screen.queryByRole("article", { name: "DEV-432" })).toBeNull();
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      expect(
        screen
          .getByRole("button", { name: `Collapse ${label}` })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    }
  });

  it("expands every column when Expand all is pressed after a collapse-all", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const toggle = screen.getByRole("button", { name: "Collapse all columns" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.textContent).toBe("Collapse all");
    expect(screen.queryByRole("article", { name: "DEV-441" })).not.toBeNull();
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      expect(
        screen
          .getByRole("button", { name: `Collapse ${label}` })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    }
  });

  it("flips Collapse all to pressed once every column has been individually collapsed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    const allToggle = screen.getByRole("button", {
      name: "Collapse all columns",
    });
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      fireEvent.click(screen.getByRole("button", { name: `Collapse ${label}` }));
    }
    expect(allToggle.getAttribute("aria-pressed")).toBe("true");
    expect(allToggle.textContent).toBe("Expand all");
  });

  it("hides the visible-count caption again after Clear filters", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.queryByLabelText("Visible task count")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByLabelText("Visible task count")).toBeNull();
  });

  it("renders a P1 count badge in column headers that contain at least one P1", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture has DEV-441 (P1, in_progress) and DEV-360 (P1, done).
    const inProgressBadge = screen.getByLabelText("P1 count for In progress");
    expect(inProgressBadge.textContent).toBe("1 P1");
    const doneBadge = screen.getByLabelText("P1 count for Done this week");
    expect(doneBadge.textContent).toBe("1 P1");
  });

  it("omits the P1 count badge in columns without any P1 tasks", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture has no P1 tasks in todo or review columns.
    expect(screen.queryByLabelText("P1 count for To do")).toBeNull();
    expect(screen.queryByLabelText("P1 count for In review")).toBeNull();
  });

  it("updates the P1 count badge when a filter narrows the visible tasks", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    expect(screen.getByLabelText("P1 count for In progress")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.queryByLabelText("P1 count for In progress")).toBeNull();
  });

  it("shows a per-column empty placeholder when a filter empties a single column", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P1 has matches in In progress + Done; To do and In review become empty.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.getByLabelText("No tasks in To do")).toBeTruthy();
    expect(screen.getByLabelText("No tasks in In review")).toBeTruthy();
    // Columns with matches do not get the placeholder.
    expect(screen.queryByLabelText("No tasks in In progress")).toBeNull();
    expect(screen.queryByLabelText("No tasks in Done this week")).toBeNull();
    // Page-level empty-state is not shown — some columns still have matches.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("omits the per-column empty placeholder for columns with at least one task", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    for (const label of ["To do", "In progress", "In review", "Done this week"]) {
      expect(screen.queryByLabelText(`No tasks in ${label}`)).toBeNull();
    }
  });

  it("hides the per-column empty placeholder when the column is collapsed", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.getByLabelText("No tasks in To do")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Collapse To do"));
    expect(screen.queryByLabelText("No tasks in To do")).toBeNull();
  });

  it("renders a header-level total P1 count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture has DEV-441 (in_progress) + DEV-360 (done) = 2 P1s total.
    const badge = screen.getByLabelText("Total P1 count");
    expect(badge.textContent).toBe("2 P1");
  });

  it("hides the total P1 count badge when filters remove every P1", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.queryByLabelText("Total P1 count")).toBeNull();
  });

  it("updates the total P1 count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Days filter ≥3d drops DEV-441 (1d P1) but keeps DEV-360 (4d P1).
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    expect(screen.getByLabelText("Total P1 count").textContent).toBe("1 P1");
  });

  it("renders a header-level total P2 count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: DEV-447 + DEV-432 + DEV-455 + DEV-388 = 4 P2s total.
    expect(screen.getByLabelText("Total P2 count").textContent).toBe("4 P2");
  });

  it("updates the total P2 count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Days ≥3d keeps only DEV-447 among P2s (3d); DEV-432/455/388 drop out.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    expect(screen.getByLabelText("Total P2 count").textContent).toBe("1 P2");
  });

  it("hides the total P2 count badge when no visible task is P2", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.queryByLabelText("Total P2 count")).toBeNull();
  });

  it("renders a header-level total P3 count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: DEV-401 + DEV-460 + DEV-378 = 3 P3s total.
    expect(screen.getByLabelText("Total P3 count").textContent).toBe("3 P3");
  });

  it("updates the total P3 count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // ≥3d filter keeps only DEV-401 (6d) among P3s; DEV-460 (0d) + DEV-378 (2d) drop.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    expect(screen.getByLabelText("Total P3 count").textContent).toBe("1 P3");
  });

  it("hides the total P3 count badge when no visible task is P3", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.queryByLabelText("Total P3 count")).toBeNull();
  });

  it("renders a stale count badge in column headers with tasks aged ≥3 days", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: in_progress has DEV-447 (3d) + DEV-401 (6d) = 2 stale.
    // done has DEV-360 (4d) = 1 stale.
    expect(
      screen.getByLabelText("Stale count for In progress").textContent,
    ).toBe("2 ≥3d");
    expect(
      screen.getByLabelText("Stale count for Done this week").textContent,
    ).toBe("1 ≥3d");
  });

  it("omits the stale count badge in columns without any stale tasks", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // To do tasks all have days=0; In review tasks are 1d and 2d.
    expect(screen.queryByLabelText("Stale count for To do")).toBeNull();
    expect(screen.queryByLabelText("Stale count for In review")).toBeNull();
  });

  it("updates the stale count badge when a filter narrows the visible tasks", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P3 in In progress is just DEV-401 (6d) — drops to 1 stale.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P3" },
    });
    expect(
      screen.getByLabelText("Stale count for In progress").textContent,
    ).toBe("1 ≥3d");
  });

  it("renders a header-level total stale count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: DEV-447 (3d) + DEV-401 (6d) + DEV-360 (4d) = 3 stale total.
    expect(screen.getByLabelText("Total stale count").textContent).toBe(
      "3 ≥3d",
    );
  });

  it("hides the total stale count badge when filters remove every stale task", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Filtering to To do leaves only fresh (days=0) tasks.
    fireEvent.change(screen.getByLabelText("Filter by assignee"), {
      target: { value: "you" },
    });
    // DEV-441 (in_progress, 1d) + DEV-360 (done, 4d) are the assigned-to-you set.
    // Only DEV-360 is stale (≥3d) → badge shows 1.
    expect(screen.getByLabelText("Total stale count").textContent).toBe(
      "1 ≥3d",
    );
  });

  it("updates the total stale count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // ≥7d filter has no matches in the fixture — badge hides.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "7" },
    });
    expect(screen.queryByLabelText("Total stale count")).toBeNull();
  });

  it("renders a header-level total unassigned count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 9 tasks total, 2 assigned to "you" (DEV-441, DEV-360) → 7 unassigned.
    expect(screen.getByLabelText("Total unassigned count").textContent).toBe(
      "7 unassigned",
    );
  });

  it("updates the total unassigned count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P3 filter: DEV-401, DEV-460, DEV-378 — all unassigned → badge shows 3.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P3" },
    });
    expect(screen.getByLabelText("Total unassigned count").textContent).toBe(
      "3 unassigned",
    );
  });

  it("hides the total unassigned count badge when every visible task has an assignee", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // assigned-to-you toggle leaves only DEV-441 + DEV-360, both assigned.
    fireEvent.click(
      screen.getByLabelText("Show only tasks assigned to you"),
    );
    expect(screen.queryByLabelText("Total unassigned count")).toBeNull();
  });

  it("renders a header-level total PR-linked count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 5 tasks have a PR linked (DEV-441, DEV-401, DEV-388, DEV-378, DEV-360).
    expect(screen.getByLabelText("Total PR-linked count").textContent).toBe(
      "5 PR",
    );
  });

  it("updates the total PR-linked count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P1 filter narrows to DEV-441 (#421) + DEV-360 (#372) → 2 PR-linked.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.getByLabelText("Total PR-linked count").textContent).toBe(
      "2 PR",
    );
  });

  it("hides the total PR-linked count badge when no visible task has a PR", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // No-PR filter leaves only unlinked tasks → badge hides.
    fireEvent.change(screen.getByLabelText("Filter by PR"), {
      target: { value: "without" },
    });
    expect(screen.queryByLabelText("Total PR-linked count")).toBeNull();
  });

  it("renders a header-level total in-review count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: DEV-388 + DEV-378 are in `review` status → 2 in review.
    expect(screen.getByLabelText("Total in-review count").textContent).toBe(
      "2 in review",
    );
  });

  it("updates the total in-review count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P2 priority narrows the review-status set to DEV-388 only.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.getByLabelText("Total in-review count").textContent).toBe(
      "1 in review",
    );
  });

  it("hides the total in-review count badge when no visible task is in review", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // assigned-to-you toggle leaves only DEV-441 (in_progress) + DEV-360 (done) → 0 in review.
    fireEvent.click(
      screen.getByLabelText("Show only tasks assigned to you"),
    );
    expect(screen.queryByLabelText("Total in-review count")).toBeNull();
  });

  it("renders a header-level total in-progress count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: DEV-441 + DEV-447 + DEV-401 are in `in_progress` status → 3 in progress.
    expect(screen.getByLabelText("Total in-progress count").textContent).toBe(
      "3 in progress",
    );
  });

  it("updates the total in-progress count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // assigned-to-you narrows to DEV-441 (in_progress) + DEV-360 (done) → 1 in progress.
    fireEvent.click(
      screen.getByLabelText("Show only tasks assigned to you"),
    );
    expect(screen.getByLabelText("Total in-progress count").textContent).toBe(
      "1 in progress",
    );
  });

  it("hides the total in-progress count badge when no visible task is in progress", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // ≥7d filter leaves no tasks (max age is DEV-401 at 6d) → 0 in progress.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "7" },
    });
    expect(screen.queryByLabelText("Total in-progress count")).toBeNull();
  });

  it("renders a header-level total to-do count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 3 tasks in `todo` (Privacy redactor + Settings shell + VAPID rotation).
    expect(screen.getByLabelText("Total to-do count").textContent).toBe(
      "3 to do",
    );
  });

  it("updates the total to-do count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P2 priority filter narrows the 3 todo tasks to the 2 P2 ones.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.getByLabelText("Total to-do count").textContent).toBe(
      "2 to do",
    );
  });

  it("hides the total to-do count badge when no visible task is in to-do", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // No fixture task is both P1 and `todo` → 0 to do.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P1" },
    });
    expect(screen.queryByLabelText("Total to-do count")).toBeNull();
  });

  it("renders a header-level total no-PR count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 4 tasks have no PR (DEV-447, DEV-432, DEV-455, DEV-460).
    expect(screen.getByLabelText("Total no-PR count").textContent).toBe(
      "4 no PR",
    );
  });

  it("updates the total no-PR count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P3 priority filter narrows the 4 no-PR set to DEV-460 only
    // (DEV-401 is P3 but has #410 linked).
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P3" },
    });
    expect(screen.getByLabelText("Total no-PR count").textContent).toBe(
      "1 no PR",
    );
  });

  it("hides the total no-PR count badge when every visible task has a PR", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // `with PR` filter leaves only linked tasks → badge hides.
    fireEvent.change(screen.getByLabelText("Filter by PR"), {
      target: { value: "with" },
    });
    expect(screen.queryByLabelText("Total no-PR count")).toBeNull();
  });

  it("renders a header-level total fresh count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 3 tasks at days=0 (DEV-432 + DEV-455 + DEV-460).
    expect(screen.getByLabelText("Total fresh count").textContent).toBe(
      "3 fresh",
    );
  });

  it("updates the total fresh count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P2 priority filter narrows the 3 fresh tasks to DEV-432 + DEV-455
    // (DEV-447 is P2 but days=3; DEV-460 is days=0 but P3).
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.getByLabelText("Total fresh count").textContent).toBe(
      "2 fresh",
    );
  });

  it("hides the total fresh count badge when no visible task is fresh", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // `≥3d` days filter leaves only stale tasks → 0 fresh.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    expect(screen.queryByLabelText("Total fresh count")).toBeNull();
  });

  it("renders a header-level total assigned count badge summing across columns", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // Fixture: 2 tasks with a non-null assignee (DEV-441 + DEV-360, both `you`).
    expect(screen.getByLabelText("Total assigned count").textContent).toBe(
      "2 assigned",
    );
  });

  it("updates the total assigned count badge to reflect the filtered set", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // ≥3d days filter narrows the 2 assigned tasks to DEV-360 (4d) only —
    // DEV-441 is assigned but only 1d old.
    fireEvent.change(screen.getByLabelText("Filter by days"), {
      target: { value: "3" },
    });
    expect(screen.getByLabelText("Total assigned count").textContent).toBe(
      "1 assigned",
    );
  });

  it("hides the total assigned count badge when every visible task is unassigned", () => {
    render(<TasksPage tasks={FIXTURE_TASKS} />);
    // P2 priority filter leaves DEV-447 + DEV-432 + DEV-455 + DEV-388 — all
    // unassigned in the fixture → badge hides.
    fireEvent.change(screen.getByLabelText("Filter by priority"), {
      target: { value: "P2" },
    });
    expect(screen.queryByLabelText("Total assigned count")).toBeNull();
  });
});
