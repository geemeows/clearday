import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TaskCard } from "#/features/signals/components/TasksKanban";
import { buildCards, TasksView } from "#/routes/_app.tasks";

const card = (overrides: Partial<TaskCard> = {}): TaskCard => ({
  key: "k",
  id: "ENG-1",
  source: "task",
  status: "todo",
  priority: "P3",
  title: "Sample task",
  labels: [],
  daysInProgress: 0,
  ...overrides,
});

function columnFor(label: string): HTMLElement {
  return screen.getByRole("listitem", { name: label });
}

describe("TasksView", () => {
  it("renders four kanban columns", () => {
    render(<TasksView signals={[]} cards={[]} error={null} loading={false} />);
    expect(columnFor("To do")).toBeTruthy();
    expect(columnFor("In progress")).toBeTruthy();
    expect(columnFor("In review")).toBeTruthy();
    expect(columnFor("Done this week")).toBeTruthy();
  });

  it("renders each card under the correct status column", () => {
    const cards: TaskCard[] = [
      card({ key: "a", id: "A-1", title: "Triage backlog", status: "todo" }),
      card({
        key: "b",
        id: "B-1",
        title: "Wire focus modal",
        status: "in_progress",
      }),
      card({
        key: "c",
        id: "C-1",
        title: "Review #401",
        status: "in_review",
      }),
      card({ key: "d", id: "D-1", title: "Ship rollup", status: "done" }),
    ];
    render(
      <TasksView signals={[]} cards={cards} error={null} loading={false} />,
    );
    expect(within(columnFor("To do")).getByText("Triage backlog")).toBeTruthy();
    expect(
      within(columnFor("In progress")).getByText("Wire focus modal"),
    ).toBeTruthy();
    expect(
      within(columnFor("In review")).getByText("Review #401"),
    ).toBeTruthy();
    expect(
      within(columnFor("Done this week")).getByText("Ship rollup"),
    ).toBeTruthy();
  });

  it("colors the priority chip per priority", () => {
    const cards: TaskCard[] = [
      card({ key: "p1", id: "X-1", title: "P1 task", priority: "P1" }),
      card({ key: "p2", id: "X-2", title: "P2 task", priority: "P2" }),
      card({ key: "p3", id: "X-3", title: "P3 task", priority: "P3" }),
    ];
    render(
      <TasksView signals={[]} cards={cards} error={null} loading={false} />,
    );
    const p1 = screen.getByRole("article", { name: "P1 task" });
    const p2 = screen.getByRole("article", { name: "P2 task" });
    const p3 = screen.getByRole("article", { name: "P3 task" });
    expect(p1.querySelector("[data-priority-chip='P1']")?.className).toContain(
      "red",
    );
    expect(p2.querySelector("[data-priority-chip='P2']")?.className).toContain(
      "amber",
    );
    expect(p3.querySelector("[data-priority-chip='P3']")?.className).toContain(
      "zinc",
    );
  });

  it("renders the PR number only when present", () => {
    const cards: TaskCard[] = [
      card({
        key: "with-pr",
        id: "ENG-1",
        title: "With PR",
        status: "in_review",
        prNumber: 412,
      }),
      card({ key: "no-pr", id: "ENG-2", title: "No PR", status: "in_review" }),
    ];
    render(
      <TasksView signals={[]} cards={cards} error={null} loading={false} />,
    );
    const withPr = screen.getByRole("article", { name: "With PR" });
    const noPr = screen.getByRole("article", { name: "No PR" });
    expect(within(withPr).getByText(/#412/)).toBeTruthy();
    expect(noPr.querySelector("[data-pr-number]")).toBeNull();
  });

  it("surfaces an error message", () => {
    render(
      <TasksView signals={null} cards={[]} error="boom" loading={false} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });
});

describe("buildCards", () => {
  it("maps GitHub PR signals into the right column with the PR number", () => {
    const cards = buildCards([
      {
        id: "sig-1",
        provider: "github",
        kind: "pr_review_requested",
        source_id: "owner/repo#42",
        title: "Add focus session",
        url: null,
        payload: { repo: "owner/repo", number: 42 },
        requires_action: true,
        source_created_at: "2026-05-01T10:00:00Z",
        dismissed_at: null,
      },
    ]);
    const gh = cards.find((c) => c.key === "sig-1");
    expect(gh).toBeDefined();
    expect(gh?.status).toBe("in_review");
    expect(gh?.prNumber).toBe(42);
    expect(gh?.id).toBe("owner/repo#42");
    expect(gh?.source).toBe("git");
  });

  it("includes mock Linear/Jira tickets alongside GitHub data", () => {
    const cards = buildCards([]);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.source === "task")).toBe(true);
  });
});
