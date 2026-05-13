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
});
