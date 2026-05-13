import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  StoredCard,
  StoredColumn,
  StoredProject,
} from "#/features/projects/store";
import {
  dueRelative,
  ProjectBoardView,
} from "#/routes/_app.projects.$projectId";
import { OnboardingView } from "#/routes/_app.projects.index";

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
    expect(
      screen.getByRole("button", { name: /create project/i }),
    ).toBeTruthy();
  });

  it("shows the four default template columns in template mode", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    const region = screen.getByRole("region", { name: /create project/i });
    expect(region.textContent).toContain("Backlog");
    expect(region.textContent).toContain("In progress");
    expect(region.textContent).toContain("In review");
    expect(region.textContent).toContain("Done");
  });

  it("calls onCreateProject with the trimmed name and template columns on submit", async () => {
    const onCreateProject = vi.fn();
    render(<OnboardingView onCreateProject={onCreateProject} />);
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Backend refactor  " } });
    fireEvent.click(screen.getByRole("button", { name: /create project/i }));
    await waitFor(() =>
      expect(onCreateProject).toHaveBeenCalledWith("Backend refactor", [
        "Backlog",
        "In progress",
        "In review",
        "Done",
      ]),
    );
  });

  it("disables the create button when name is empty", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    const input = screen.getByLabelText("Project name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    const btn = screen.getByRole("button", { name: /create project/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("switching to Custom columns mode shows column inputs", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /custom columns/i }));
    expect(screen.getByRole("list", { name: /custom columns/i })).toBeTruthy();
  });

  it("adding a custom column appends an input", () => {
    render(<OnboardingView onCreateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /custom columns/i }));
    const before = screen.getAllByRole("textbox", {
      name: /column \d+ name/i,
    }).length;
    fireEvent.click(screen.getByText(/\+ add column/i));
    const after = screen.getAllByRole("textbox", {
      name: /column \d+ name/i,
    }).length;
    expect(after).toBe(before + 1);
  });

  it("calls onCreateProject with custom column names when submitted in custom mode", async () => {
    const onCreateProject = vi.fn();
    render(<OnboardingView onCreateProject={onCreateProject} />);
    fireEvent.click(screen.getByRole("button", { name: /custom columns/i }));

    const inputs = screen.getAllByRole("textbox", { name: /column \d+ name/i });
    fireEvent.change(inputs[0], { target: { value: "Idea" } });
    fireEvent.change(inputs[1], { target: { value: "Building" } });
    fireEvent.change(inputs[2], { target: { value: "Shipped" } });

    fireEvent.click(screen.getByRole("button", { name: /create project/i }));
    await waitFor(() =>
      expect(onCreateProject).toHaveBeenCalledWith("My first project", [
        "Idea",
        "Building",
        "Shipped",
      ]),
    );
  });
});

// ─── ProjectBoardView ────────────────────────────────────────────────────────

describe("ProjectBoardView", () => {
  const noop = () => {};

  it("renders the 'Projects' page heading and shows the active project name", () => {
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
    expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
    expect(screen.getByText("Sprint 7")).toBeTruthy();
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

  it("renders the empty-column hint when a column has no cards", () => {
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [card({ id: "k1", column_id: "c2", title: "Shipped", order: 0 })];
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
    expect(within(backlog).getByText("Empty · drop cards here")).toBeTruthy();
    expect(within(done).queryByText("Empty · drop cards here")).toBeNull();
  });

  it("renders the column header on t-title-sm typography with a plain mono card count", () => {
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
    const cards = [
      card({ id: "k1", column_id: "c1", title: "A", order: 0 }),
      card({ id: "k2", column_id: "c1", title: "B", order: 1 }),
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
    const name = screen.getByText("Backlog");
    expect(name.className).toContain("text-[13px]");
    expect(name.className).toContain("font-semibold");
    const count = screen.getByText("2");
    expect(count.className).toContain("font-mono");
    expect(count.className).toContain("text-[11px]");
    expect(count.className).not.toContain("rounded-full");
    expect(count.className).not.toContain("bg-muted");
  });

  it("renders the column resting surface on --surface-soft with a transparent border", () => {
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
    const col = screen.getByRole("article", { name: "Backlog" });
    expect(col.className).toContain("bg-[var(--surface-soft)]");
    expect(col.className).toContain("border-transparent");
    expect(col.className).not.toContain("bg-card");
  });

  it("highlights the column with a dashed primary border while dragged over", () => {
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
    const col = screen.getByRole("article", { name: "Backlog" });
    expect(col.getAttribute("data-drag-over")).toBeNull();
    fireEvent.dragOver(col);
    expect(col.getAttribute("data-drag-over")).toBe("true");
    expect((col as HTMLElement).style.borderStyle).toBe("dashed");
    expect((col as HTMLElement).style.background).toContain(
      "var(--primary-disabled)",
    );
    fireEvent.dragLeave(col);
    expect(col.getAttribute("data-drag-over")).toBeNull();
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
    fireEvent.click(
      screen.getByRole("button", { name: /add card to backlog/i }),
    );
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
    expect(
      screen.queryByRole("textbox", { name: /new card title/i }),
    ).toBeNull();
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
  it("color-codes the priority chip per design (P1 → danger, P2 → warn, P3 → muted)", () => {
    const cards = [
      card({ id: "k1", column_id: "col1", title: "Urgent", priority: "P1", order: 0 }),
      card({ id: "k2", column_id: "col1", title: "Soon", priority: "P2", order: 1 }),
      card({ id: "k3", column_id: "col1", title: "Whenever", priority: "P3", order: 2 }),
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const p1 = screen.getByText("P1") as HTMLElement;
    const p2 = screen.getByText("P2") as HTMLElement;
    const p3 = screen.getByText("P3") as HTMLElement;
    expect(p1.style.background).toContain("--danger-soft");
    expect(p1.style.color).toContain("--danger");
    expect(p2.style.background).toContain("--warn-soft");
    expect(p2.style.color).toContain("--warn");
    expect(p3.style.background).toContain("--surface-strong");
    expect(p3.style.color).toContain("--muted-foreground");
  });

  it("renders DUE TODAY / TOMORROW chips per design for today/tomorrow due_at", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T10:00:00Z"));
    try {
      const today = new Date("2026-05-11T15:00:00Z").toISOString();
      const tomorrow = new Date("2026-05-12T15:00:00Z").toISOString();
      const later = new Date("2026-05-20T15:00:00Z").toISOString();
      render(
        <ProjectBoardView
          project={project()}
          columns={[column()]}
          cards={[
            card({ id: "k1", column_id: "col1", title: "Today", due_at: today, order: 0 }),
            card({ id: "k2", column_id: "col1", title: "Tomorrow", due_at: tomorrow, order: 1 }),
            card({ id: "k3", column_id: "col1", title: "Later", due_at: later, order: 2 }),
          ]}
          loading={false}
          error={null}
          onAddCard={() => {}}
        />,
      );
      const todayChip = screen.getByText("DUE TODAY") as HTMLElement;
      const tomorrowChip = screen.getByText("TOMORROW") as HTMLElement;
      expect(todayChip.style.background).toContain("--primary-disabled");
      expect(todayChip.style.color).toContain("--primary-active");
      expect(tomorrowChip.style.background).toContain("--surface-strong");
      expect(tomorrowChip.style.color).toContain("--muted-foreground");
      expect(screen.queryByText("DUE TODAY")).toBeTruthy();
      expect(screen.getByText("2026-05-20")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders linked-ticket chip as a SourceGlyph + mono ext_id per design", () => {
    const tickets = [
      {
        id: "t1",
        card_id: "k1",
        source: "github" as const,
        ext_id: "owner/repo#42",
        url: "https://github.com/owner/repo/issues/42",
        status: "open",
        assignee: null,
        last_seen_at: null,
        created_at: "2026-05-11T00:00:00Z",
      },
      {
        id: "t2",
        card_id: "k1",
        source: "linear" as const,
        ext_id: "DEV-441",
        url: "https://linear.app/x/issue/DEV-441",
        status: null,
        assignee: null,
        last_seen_at: null,
        created_at: "2026-05-11T00:00:00Z",
      },
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({ id: "k1", column_id: "col1", title: "Linked", order: 0 }),
        ]}
        tickets={tickets}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const ghChip = screen.getByTestId("card-chip-ticket-t1");
    expect(ghChip.textContent).toContain("owner/repo#42");
    expect(ghChip.textContent).not.toContain("github ·");
    expect(ghChip.querySelector('[data-source="git"]')).toBeTruthy();
    expect(ghChip.getAttribute("title")).toBe("open");

    const linChip = screen.getByTestId("card-chip-ticket-t2");
    expect(linChip.textContent).toContain("DEV-441");
    expect(linChip.querySelector('[data-source="linear"]')).toBeTruthy();
    expect(linChip.getAttribute("title")).toBe("reconnect to refresh");
  });

  it("renders chips above the title with design-token title typography (13px/500/1.35)", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({
            id: "k1",
            column_id: "col1",
            title: "Order me",
            priority: "P1",
            order: 0,
          }),
        ]}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "Order me" });
    const children = Array.from(cardButton.children);
    const chipRowIdx = children.findIndex((el) =>
      el.querySelector('[data-priority="P1"]'),
    );
    const titleIdx = children.findIndex((el) => el.textContent === "Order me");
    expect(chipRowIdx).toBeGreaterThanOrEqual(0);
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(chipRowIdx).toBeLessThan(titleIdx);
    const titleEl = children[titleIdx] as HTMLElement;
    expect(titleEl.className).toContain("text-[13px]");
    expect(titleEl.className).toContain("font-medium");
    expect(titleEl.className).toContain("leading-[1.35]");
  });

  it("omits the chip row when card has no priority, no due, and no tickets", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({
            id: "k1",
            column_id: "col1",
            title: "Bare card",
            priority: null,
            due_at: null,
            order: 0,
          }),
        ]}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "Bare card" });
    expect(cardButton.querySelector("[data-priority]")).toBeNull();
    expect(cardButton.querySelector("[data-due]")).toBeNull();
    // Only the title span should be a direct child.
    expect(cardButton.children.length).toBe(1);
  });

  it("renders card.tags as mono label pills below the title", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({
            id: "k1",
            column_id: "col1",
            title: "Labeled card",
            tags: ["api", "auth"],
            order: 0,
          }),
        ]}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "Labeled card" });
    const labelsRow = cardButton.querySelector('[data-slot="card-labels"]');
    expect(labelsRow).not.toBeNull();
    const labels = labelsRow!.querySelectorAll("span");
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe("api");
    expect(labels[1].textContent).toBe("auth");
    expect((labels[0] as HTMLElement).className).toContain("font-mono");
    expect((labels[0] as HTMLElement).className).toContain("text-[9px]");
    expect((labels[0] as HTMLElement).style.background).toBe(
      "var(--surface-soft)",
    );
  });

  it("renders linked-signals count chip from active card_signal links", () => {
    const baseSignal = {
      id: "ls1",
      card_id: "k1",
      project_id: "p1",
      signal_id: "s1",
      deleted_at: null,
      created_at: "2026-05-11T00:00:00Z",
    };
    const signals = [
      baseSignal,
      { ...baseSignal, id: "ls2", signal_id: "s2" },
      // Tombstoned: signal was deleted — should not count.
      {
        ...baseSignal,
        id: "ls3",
        signal_id: null,
        deleted_at: "2026-05-12T00:00:00Z",
      },
      // Different card — should not count.
      { ...baseSignal, id: "ls4", card_id: "k2", signal_id: "s4" },
    ];
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({ id: "k1", column_id: "col1", title: "Linked card", order: 0 }),
          card({ id: "k2", column_id: "col1", title: "Other card", order: 1 }),
        ]}
        signals={signals}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const linkedButton = screen.getByRole("button", { name: "Linked card" });
    const chip = linkedButton.querySelector(
      '[data-slot="linked-signals-count"]',
    ) as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain("2");
    expect(chip!.getAttribute("aria-label")).toBe("2 linked signals");

    const otherButton = screen.getByRole("button", { name: "Other card" });
    const otherChip = otherButton.querySelector(
      '[data-slot="linked-signals-count"]',
    ) as HTMLElement | null;
    expect(otherChip).not.toBeNull();
    expect(otherChip!.getAttribute("aria-label")).toBe("1 linked signal");
  });

  it("omits the linked-signals chip when no active signal links exist", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[card({ id: "k1", column_id: "col1", title: "Bare", order: 0 })]}
        signals={[]}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "Bare" });
    expect(
      cardButton.querySelector('[data-slot="linked-signals-count"]'),
    ).toBeNull();
  });

  it("renders KanbanCard on bg-card with rounded-[10px] geometry", () => {
    render(
      <ProjectBoardView
        project={project()}
        columns={[column()]}
        cards={[
          card({
            id: "k1",
            column_id: "col1",
            title: "Surface card",
            order: 0,
          }),
        ]}
        loading={false}
        error={null}
        onAddCard={() => {}}
      />,
    );
    const cardButton = screen.getByRole("button", { name: "Surface card" });
    expect(cardButton.className).toContain("bg-card");
    expect(cardButton.className).toContain("rounded-[10px]");
    expect(cardButton.className).toContain("py-2.5");
    expect(cardButton.className).not.toContain("bg-background");
  });

  it("dueRelative returns today/tomorrow/null based on local day diff", () => {
    const now = new Date("2026-05-11T10:00:00");
    expect(dueRelative(new Date("2026-05-11T23:00:00").toISOString(), now)).toBe("today");
    expect(dueRelative(new Date("2026-05-12T01:00:00").toISOString(), now)).toBe("tomorrow");
    expect(dueRelative(new Date("2026-05-13T10:00:00").toISOString(), now)).toBeNull();
    expect(dueRelative("not-a-date", now)).toBeNull();
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
    const cardBLi = screen
      .getByRole("button", { name: "Card B" })
      .closest("li") as HTMLElement;
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
    const cardBLi = screen
      .getByRole("button", { name: "Card B" })
      .closest("li") as HTMLElement;
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
    const cardALi = cardAButton.closest("li") as HTMLElement;
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

    fireEvent.keyDown(screen.getByRole("button", { name: "Card A" }), {
      key: "ArrowLeft",
    });

    expect(onMoveCard).not.toHaveBeenCalled();
  });

  it("ArrowRight on the last column is a no-op (clamps)", () => {
    const onMoveCard = vi.fn();
    const cols = [column({ id: "c1", name: "Backlog", order: 0 })];
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

    fireEvent.keyDown(screen.getByRole("button", { name: "Card A" }), {
      key: "ArrowRight",
    });

    expect(onMoveCard).not.toHaveBeenCalled();
  });
});

// ─── ProjectBoardView — column settings panel ────────────────────────────────

describe("ProjectBoardView — column settings", () => {
  const noop = () => {};

  function renderWithCols(
    cols: StoredColumn[],
    cards: StoredCard[],
    handlers: {
      onUpdateColumn?: (
        id: string,
        patch: { name?: string; wip_limit?: number | null; order?: number },
      ) => void;
      onDeleteColumn?: (id: string) => void;
      onAddColumn?: (name: string) => void;
      onReorderColumns?: (movedId: string, afterId: string | null) => void;
    } = {},
  ) {
    render(
      <ProjectBoardView
        project={project()}
        columns={cols}
        cards={cards}
        loading={false}
        error={null}
        onAddCard={noop}
        {...handlers}
      />,
    );
  }

  it("opens the column settings panel when the settings button is clicked", () => {
    renderWithCols([column()], []);
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    expect(
      screen.getByRole("dialog", { name: "Column settings" }),
    ).toBeTruthy();
  });

  it("closes the settings panel when Close is clicked", () => {
    renderWithCols([column()], []);
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /close column settings/i }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Column settings" }),
    ).toBeNull();
  });

  it("shows rename input for each column", () => {
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    renderWithCols(cols, []);
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    expect(
      screen.getByRole("textbox", { name: /rename column backlog/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: /rename column done/i }),
    ).toBeTruthy();
  });

  it("calls onUpdateColumn with new name on blur", async () => {
    const onUpdateColumn = vi.fn();
    renderWithCols([column({ id: "c1", name: "Backlog" })], [], {
      onUpdateColumn,
    });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    const input = screen.getByRole("textbox", {
      name: /rename column backlog/i,
    });
    fireEvent.change(input, { target: { value: "Sprint" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(onUpdateColumn).toHaveBeenCalledWith("c1", { name: "Sprint" }),
    );
  });

  it("calls onReorderColumns when move up is clicked", () => {
    const onReorderColumns = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    renderWithCols(cols, [], { onReorderColumns });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /move done up/i }));
    expect(onReorderColumns).toHaveBeenCalledWith("c2", null);
  });

  it("calls onReorderColumns when move down is clicked", () => {
    const onReorderColumns = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    renderWithCols(cols, [], { onReorderColumns });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.click(screen.getByRole("button", { name: /move backlog down/i }));
    expect(onReorderColumns).toHaveBeenCalledWith("c1", "c2");
  });

  it("delete button is disabled when there is only one column", () => {
    renderWithCols([column({ id: "c1", name: "Backlog" })], []);
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    const deleteBtn = screen.getByRole("button", { name: /cannot delete/i });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows confirm step when delete is clicked on a non-empty column", () => {
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    const cards = [card({ id: "k1", column_id: "c1" })];
    renderWithCols(cols, cards);
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /delete column backlog/i }),
    );
    expect(
      screen.getByRole("button", { name: /confirm delete backlog/i }),
    ).toBeTruthy();
  });

  it("calls onDeleteColumn after confirming delete", async () => {
    const onDeleteColumn = vi.fn();
    const cols = [
      column({ id: "c1", name: "Backlog", order: 0 }),
      column({ id: "c2", name: "Done", order: 1 }),
    ];
    renderWithCols(cols, [], { onDeleteColumn });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /delete column backlog/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /confirm delete backlog/i }),
    );
    await waitFor(() => expect(onDeleteColumn).toHaveBeenCalledWith("c1"));
  });

  it("calls onAddColumn when a new column name is submitted", async () => {
    const onAddColumn = vi.fn();
    renderWithCols([column()], [], { onAddColumn });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.change(
      screen.getByRole("textbox", { name: /new column name/i }),
      {
        target: { value: "Review" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /^add column$/i }));
    await waitFor(() => expect(onAddColumn).toHaveBeenCalledWith("Review"));
  });

  it("calls onUpdateColumn with wip_limit when the WIP input changes", async () => {
    const onUpdateColumn = vi.fn();
    renderWithCols([column({ id: "c1", name: "Backlog" })], [], {
      onUpdateColumn,
    });
    fireEvent.click(screen.getByRole("button", { name: /column settings/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /wip limit/i }), {
      target: { value: "3" },
    });
    await waitFor(() =>
      expect(onUpdateColumn).toHaveBeenCalledWith("c1", { wip_limit: 3 }),
    );
  });
});

// ─── ProjectBoardView — project switcher ─────────────────────────────────────

describe("ProjectBoardView — project switcher", () => {
  const noop = () => {};

  const twoProjects: StoredProject[] = [
    project({ id: "p1", name: "My Project" }),
    project({ id: "p2", name: "Sprint 7" }),
  ];

  const fiveProjects: StoredProject[] = [
    project({ id: "p1", name: "My Project" }),
    project({ id: "p2", name: "Sprint 7" }),
    project({ id: "p3", name: "Platform" }),
    project({ id: "p4", name: "Personal" }),
    project({ id: "p5", name: "Inbox triage" }),
  ];

  it("renders a pill row when there are ≤4 projects, with the active pill marked aria-selected", () => {
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={twoProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    const listbox = screen.getByRole("listbox", { name: /switch project/i });
    const activePill = within(listbox).getByRole("option", {
      name: /my project/i,
    });
    expect(activePill.getAttribute("aria-selected")).toBe("true");
    const inactivePill = within(listbox).getByRole("option", {
      name: /sprint 7/i,
    });
    expect(inactivePill.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onNavigateToProject when a pill is clicked (≤4 case)", () => {
    const onNavigateToProject = vi.fn();
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={twoProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
        onNavigateToProject={onNavigateToProject}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: /sprint 7/i }));
    expect(onNavigateToProject).toHaveBeenCalledWith("p2");
  });

  it("renders a dropdown trigger when there are >4 projects, opens listbox with all projects", () => {
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={fiveProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
      />,
    );
    const trigger = screen.getByRole("button", { name: /my project/i });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox", { name: /switch project/i });
    expect(within(listbox).getByRole("option", { name: /sprint 7/i })).toBeTruthy();
    expect(within(listbox).getByRole("option", { name: /platform/i })).toBeTruthy();
    expect(within(listbox).getByRole("option", { name: /inbox triage/i })).toBeTruthy();
  });

  it("calls onNavigateToProject when a dropdown option is selected (>4 case)", () => {
    const onNavigateToProject = vi.fn();
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={fiveProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
        onNavigateToProject={onNavigateToProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /my project/i }));
    fireEvent.click(screen.getByRole("option", { name: /sprint 7/i }));
    expect(onNavigateToProject).toHaveBeenCalledWith("p2");
  });

  it("calls onNewProject from the pill row 'New project' button (≤4 case)", () => {
    const onNewProject = vi.fn();
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={twoProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
        onNewProject={onNewProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it("calls onNewProject from the dropdown footer 'New project' (>4 case)", () => {
    const onNewProject = vi.fn();
    render(
      <ProjectBoardView
        project={project({ id: "p1", name: "My Project" })}
        allProjects={fiveProjects}
        columns={[]}
        cards={[]}
        loading={false}
        error={null}
        onAddCard={noop}
        onNewProject={onNewProject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /my project/i }));
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });
});
