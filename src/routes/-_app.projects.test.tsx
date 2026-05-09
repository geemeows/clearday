import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingView } from "#/routes/_app.projects.index";
import { ProjectBoardView } from "#/routes/_app.projects.$projectId";
import type { StoredCard, StoredColumn, StoredProject } from "#/features/projects/store";

// ─── helpers ────────────────────────────────────────────────────────────────

function project(overrides: Partial<StoredProject> = {}): StoredProject {
  return {
    id: "p1",
    name: "My Project",
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function column(overrides: Partial<StoredColumn> = {}): StoredColumn {
  return {
    id: "col1",
    project_id: "p1",
    name: "Backlog",
    order: 0,
    wip_limit: null,
    ...overrides,
  };
}

function card(overrides: Partial<StoredCard> = {}): StoredCard {
  return {
    id: "card1",
    project_id: "p1",
    column_id: "col1",
    order: 0,
    title: "My card",
    body: null,
    priority: null,
    tags: [],
    due_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── OnboardingView ──────────────────────────────────────────────────────────

describe("OnboardingView", () => {
  it("renders the project name input and create button", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    expect(screen.getByLabelText("Project name")).toBeTruthy();
    expect(screen.getByRole("button", { name: /create project/i })).toBeTruthy();
  });

  it("shows the four default template columns", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    const region = screen.getByRole("region", { name: /create your first project/i });
    expect(region.textContent).toContain("Backlog");
    expect(region.textContent).toContain("In progress");
    expect(region.textContent).toContain("In review");
    expect(region.textContent).toContain("Done");
  });

  it("calls onCreateProject with the trimmed name on submit", async () => {
    const onCreateProject = vi.fn();
    render(<OnboardingView onCreateProject={onCreateProject} />);
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Backend refactor  " } });
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));
    await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith("Backend refactor"));
  });

  it("disables the create button when name is empty", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    const btn = screen.getByRole("button", { name: /create project/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── ProjectBoardView ────────────────────────────────────────────────────────

describe("ProjectBoardView", () => {
  const noop = () => {};

  it("renders project name in the heading", () => {
    render(
      <ProjectBoardView
        project={project({ name: "Sprint 7" })}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    expect(screen.getByRole("heading", { name: "Sprint 7" })).toBeTruthy();
  });

  it("renders each column as an article with the column name", () => {
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "In progress", order: 1 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    expect(screen.getByRole("article", { name: "Backlog" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "In progress" })).toBeTruthy();
  });

  it("renders cards under their column", () => {
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
      card({ id: "k2", column_id: "c2", title: "Card B", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    const backlog = screen.getByRole("article", { name: "Backlog" });
    const done = screen.getByRole("article", { name: "Done" });
    expect(within(backlog).getByText("Card A")).toBeTruthy();
    expect(within(done).getByText("Card B")).toBeTruthy();
  });

  it("renders cards in dense order sequence within a column", () => {
    const cards = [
      card({ id: "k2", column_id: "col1", title: "Second", order: 1 }),
      card({ id: "k1", column_id: "col1", title: "First", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    const col = screen.getByRole("article", { name: "Backlog" });
    const items = within(col).getAllByRole("button", { name: /first|second/i });
    expect(items[0].textContent).toContain("First");
    expect(items[1].textContent).toContain("Second");
  });

  it("calls onAddCard when a card is composed and submitted", async () => {
    const onAddCard = vi.fn();
    render(
      <ProjectBoardView
        project={project()}
        columns={[column({ id: "col1" })]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={onAddCard}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add card to backlog/i }));
    const input = screen.getByRole("textbox", { name: /new card title/i });
    fireEvent.change(input, { target: { value: "Fix the bug" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(onAddCard).toHaveBeenCalledWith("col1", "Fix the bug"),
    );
  });

  it("shows an error message when error prop is set", () => {
    render(
      <ProjectBoardView
        project={null}
        columns={[]}
        cards={[]}
        loading={false}
        error="network error"
        onAddCard={noop}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("network error");
  });

  it("shows loading state while data is loading", () => {
    render(
      <ProjectBoardView
        project={null}
        columns={[]}
        cards={[]}
        loading={true}
        error={null}
        onAddCard={noop}
      />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("cancels card compose on Escape", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));
    const input = screen.getByRole("textbox", { name: /new card title/i });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /new card title/i })).toBeNull();
  });

  it("clicking a card opens the detail pane", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[card()]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "My card" }));
    expect(screen.getByRole("dialog", { name: "Card details" })).toBeTruthy();
  });

  it("detail pane close button dismisses the pane", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[card()]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "My card" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("onUpdateCard is called when the column changes in the pane", async () => {
    const onUpdateCard = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={[card({ column_id: "c1" })]}
        loading={false}
        error={null}
        onAddCard={noop}
        onUpdateCard={onUpdateCard}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "My card" }));
    const select = screen.getByRole("combobox", { name: "Column" });
    fireEvent.change(select, { target: { value: "c2" } });
    await waitFor(() =>
      expect(onUpdateCard).toHaveBeenCalledWith("card1", { column_id: "c2" }),
    );
  });

  it("onDeleteCard is called after confirming delete in the pane", async () => {
    const onDeleteCard = vi.fn();
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[card()]}
        loading={false}
        error={null}
        onAddCard={noop}
        onDeleteCard={onDeleteCard}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "My card" }));
    fireEvent.click(screen.getByRole("button", { name: /delete card/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(onDeleteCard).toHaveBeenCalledWith("card1"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ─── Drag-and-drop + keyboard moves ─────────────────────────────────────────

describe("ProjectBoardView — drag-and-drop", () => {
  const noop = () => {};

  it("drag within a column calls onMoveCard with the hovered card as afterId", () => {
    const onMoveCard = vi.fn();
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
      card({ id: "k2", column_id: "c1", title: "Card B", order: 1 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    const cardAButton = screen.getByRole("button", { name: "Card A" });
    // dragStart sets the dragged card id in the shared ref
    fireEvent.dragStart(cardAButton);
    // dragEnter on Card B's li marks it as the drop target
    const cardBLi = screen.getByRole("button", { name: "Card B" }).closest("li")!;
    fireEvent.dragEnter(cardBLi);
    // drop on the column article triggers the move
    fireEvent.drop(screen.getByRole("article", { name: "Backlog" }));

    expect(onMoveCard).toHaveBeenCalledWith("k1", "c1", "k2");
  });

  it("drag across columns calls onMoveCard with the destination column and hovered card", () => {
    const onMoveCard = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
      card({ id: "k2", column_id: "c2", title: "Card B", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    const cardAButton = screen.getByRole("button", { name: "Card A" });
    fireEvent.dragStart(cardAButton);
    const cardBLi = screen.getByRole("button", { name: "Card B" }).closest("li")!;
    fireEvent.dragEnter(cardBLi);
    fireEvent.drop(screen.getByRole("article", { name: "Done" }));

    expect(onMoveCard).toHaveBeenCalledWith("k1", "c2", "k2");
  });

  it("drag to an empty column calls onMoveCard with afterId=null", () => {
    const onMoveCard = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    fireEvent.dragStart(screen.getByRole("button", { name: "Card A" }));
    // Drop directly on Done column without entering any card li
    fireEvent.drop(screen.getByRole("article", { name: "Done" }));

    expect(onMoveCard).toHaveBeenCalledWith("k1", "c2", null);
  });

  it("dragging a card over itself does not update the drop target", () => {
    const onMoveCard = vi.fn();
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
      card({ id: "k2", column_id: "c1", title: "Card B", order: 1 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    const cardAButton = screen.getByRole("button", { name: "Card A" });
    fireEvent.dragStart(cardAButton);
    // Hover over own li — should be ignored
    const cardALi = cardAButton.closest("li")!;
    fireEvent.dragEnter(cardALi);
    // Drop without hovering over any other card → afterId falls back to last card (k2)
    fireEvent.drop(screen.getByRole("article", { name: "Backlog" }));

    // afterId must NOT be k1 (self); falls back to sorted last card k2
    expect(onMoveCard).toHaveBeenCalledWith("k1", "c1", "k2");
  });
});

describe("ProjectBoardView — keyboard ←/→ moves", () => {
  const noop = () => {};

  it("ArrowRight moves a card to the next column (placed at the bottom)", () => {
    const onMoveCard = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "Card A", order: 0 }),
      card({ id: "k2", column_id: "c2", title: "Card B", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Card A" }), {
      key: "ArrowRight",
    });

    // c2 has k2 as last card → afterId = k2
    expect(onMoveCard).toHaveBeenCalledWith("k1", "c2", "k2");
  });

  it("ArrowLeft moves a card to the previous column (placed at the bottom)", () => {
    const onMoveCard = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [
      card({ id: "k2", column_id: "c2", title: "Card B", order: 0 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Card B" }), {
      key: "ArrowLeft",
    });

    // c1 is empty → afterId = null
    expect(onMoveCard).toHaveBeenCalledWith("k2", "c1", null);
  });

  it("ArrowLeft on the first column is a no-op (clamps)", () => {
    const onMoveCard = vi.fn();
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
    const cards = [card({ id: "k1", column_id: "c1", title: "Card A", order: 0 })];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Card A" }), {
      key: "ArrowLeft",
    });

    expect(onMoveCard).not.toHaveBeenCalled();
  });

  it("ArrowRight on the last column is a no-op (clamps)", () => {
    const onMoveCard = vi.fn();
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
    const cards = [card({ id: "k1", column_id: "c1", title: "Card A", order: 0 })];
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        onMoveCard={onMoveCard}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Card A" }), {
      key: "ArrowRight",
    });

    expect(onMoveCard).not.toHaveBeenCalled();
  });
});
