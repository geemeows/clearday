// Projects page — smoke, board, card, and modal tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: { user: { email: "test@example.com", user_metadata: {} } },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/projects" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import {
  ProjectsPage,
  KanbanColumn,
  KanbanCard,
  NewProjectDialog,
  CardDetailDialog,
  SignalLinkPickerDialog,
} from "#/features/projects/components/ProjectsPage";
import type {
  ProjectCard,
  ProjectDef,
  KanbanColumnDef,
} from "#/features/projects/components/ProjectsPage";
import { Dialog } from "#/components/ui/dialog";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeColumn(overrides: Partial<KanbanColumnDef> = {}): KanbanColumnDef {
  return { id: "col1", name: "To do", ...overrides };
}

function makeCard(overrides: Partial<ProjectCard> = {}): ProjectCard {
  return {
    id: "test-c1",
    col: "col1",
    title: "Test card",
    desc: "",
    priority: "P2",
    labels: ["infra"],
    due: null,
    linked: null,
    linkedSignals: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectDef> = {}): ProjectDef {
  return {
    id: "p-test",
    name: "Test Project",
    color: "#111",
    activeCol: "col1",
    columns: [makeColumn()],
    cards: [makeCard()],
    ...overrides,
  };
}

// ── ProjectsPage smoke tests ──────────────────────────────────────────────────

describe("ProjectsPage", () => {
  it("renders the board heading with active project name", () => {
    render(<ProjectsPage />);
    expect(screen.getByLabelText(/Active project: Platform Q2/i)).toBeTruthy();
  });

  it("renders the kanban board region", () => {
    render(<ProjectsPage />);
    expect(screen.getByLabelText(/kanban board/i)).toBeTruthy();
  });

  it("renders fixture columns", () => {
    render(<ProjectsPage />);
    expect(screen.getByLabelText(/Backlog column/i)).toBeTruthy();
    expect(screen.getByLabelText(/In progress column/i)).toBeTruthy();
    expect(screen.getByLabelText(/In review column/i)).toBeTruthy();
    expect(screen.getByLabelText(/Shipped column/i)).toBeTruthy();
  });

  it("renders fixture cards in their columns", () => {
    render(<ProjectsPage />);
    expect(screen.getByLabelText("Slack adapter retry budget")).toBeTruthy();
    expect(screen.getByLabelText("Auth-proxy state token TTL audit")).toBeTruthy();
  });

  it("shows project stats in header", () => {
    render(<ProjectsPage />);
    expect(screen.getByLabelText(/project stats/i)).toBeTruthy();
  });
});

// ── KanbanColumn unit tests ───────────────────────────────────────────────────

describe("KanbanColumn", () => {
  const project = makeProject();
  const col = makeColumn();
  const cards = [makeCard()];

  it("renders column name and card count", () => {
    render(
      <KanbanColumn
        col={col}
        project={project}
        cards={cards}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("To do")).toBeTruthy();
  });

  it("renders empty placeholder when no cards", () => {
    render(
      <KanbanColumn
        col={col}
        project={project}
        cards={[]}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/Empty · drop cards here/i)).toBeTruthy();
  });

  it("calls onAdd when + button is clicked", () => {
    const onAdd = vi.fn();
    render(
      <KanbanColumn
        col={col}
        project={project}
        cards={cards}
        onMove={vi.fn()}
        onAdd={onAdd}
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(`Add card to ${col.name}`));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("shows active indicator dot for active column", () => {
    render(
      <KanbanColumn
        col={col}
        project={project}
        cards={cards}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    // active column has an indicator with title
    expect(
      screen.getByTitle("Active column — surfaces on Today"),
    ).toBeTruthy();
  });
});

// ── KanbanCard unit tests ─────────────────────────────────────────────────────

describe("KanbanCard", () => {
  it("renders card title", () => {
    const card = makeCard({ title: "My task" });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("My task")).toBeTruthy();
  });

  it("calls onOpen when clicked", () => {
    const onOpen = vi.fn();
    const card = makeCard();
    render(<KanbanCard card={card} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: card.title }));
    expect(onOpen).toHaveBeenCalledWith(card);
  });

  it("shows DUE TODAY chip when due is today", () => {
    const card = makeCard({ due: "today" });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("DUE TODAY")).toBeTruthy();
  });

  it("shows TOMORROW chip when due is tomorrow", () => {
    const card = makeCard({ due: "tomorrow" });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("TOMORROW")).toBeTruthy();
  });

  it("renders priority chip", () => {
    const card = makeCard({ priority: "P1" });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("P1")).toBeTruthy();
  });

  it("renders linked signal count when present", () => {
    const card = makeCard({ linkedSignals: ["s1", "s2"] });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByTitle("2 linked signal(s)")).toBeTruthy();
  });

  it("renders labels", () => {
    const card = makeCard({ labels: ["infra", "security"] });
    render(<KanbanCard card={card} onOpen={vi.fn()} />);
    expect(screen.getByText("infra")).toBeTruthy();
    expect(screen.getByText("security")).toBeTruthy();
  });
});

// ── NewProjectDialog unit tests ───────────────────────────────────────────────

describe("NewProjectDialog", () => {
  it("renders the dialog content", () => {
    render(<Dialog open><NewProjectDialog onClose={vi.fn()} onCreate={vi.fn()} /></Dialog>);
    expect(screen.getByText("New project")).toBeTruthy();
  });

  it("Create project button disabled when name is empty", () => {
    render(<Dialog open><NewProjectDialog onClose={vi.fn()} onCreate={vi.fn()} /></Dialog>);
    expect(
      screen
        .getByRole("button", { name: /create project/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("calls onCreate when name is filled and button clicked", () => {
    const onCreate = vi.fn();
    render(<Dialog open><NewProjectDialog onClose={vi.fn()} onCreate={onCreate} /></Dialog>);
    const input = screen.getByPlaceholderText(/Platform Q2/i);
    fireEvent.change(input, { target: { value: "New Board" } });
    const btn = screen.getByRole("button", { name: /create project/i });
    fireEvent.click(btn);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0][0].name).toBe("New Board");
  });

  it("calls onClose on cancel", () => {
    const onClose = vi.fn();
    render(<Dialog open><NewProjectDialog onClose={onClose} onCreate={vi.fn()} /></Dialog>);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── CardDetailDialog unit tests ───────────────────────────────────────────────

describe("CardDetailDialog", () => {
  const project = makeProject();

  it("renders card title", () => {
    const card = makeCard({ title: "Detail card" });
    render(
      <Dialog open>
        <CardDetailDialog
          card={card}
          project={project}
          onUpdate={vi.fn()}
          onLinkSignal={vi.fn()}
        />
      </Dialog>,
    );
    expect(screen.getByDisplayValue("Detail card")).toBeTruthy();
  });

  it("calls onUpdate when title is edited", () => {
    const onUpdate = vi.fn();
    const card = makeCard({ title: "Old title" });
    render(
      <Dialog open>
        <CardDetailDialog
          card={card}
          project={project}
          onUpdate={onUpdate}
          onLinkSignal={vi.fn()}
        />
      </Dialog>,
    );
    const titleInput = screen.getByLabelText("Card title");
    fireEvent.change(titleInput, { target: { value: "New title" } });
    expect(onUpdate).toHaveBeenCalledWith({ title: "New title" });
  });

  it("calls onLinkSignal when Link signal is clicked", () => {
    const onLinkSignal = vi.fn();
    render(
      <Dialog open>
        <CardDetailDialog
          card={makeCard()}
          project={project}
          onUpdate={vi.fn()}
          onLinkSignal={onLinkSignal}
        />
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: /link signal/i }));
    expect(onLinkSignal).toHaveBeenCalledOnce();
  });

  it("shows empty signal placeholder when no signals linked", () => {
    render(
      <Dialog open>
        <CardDetailDialog
          card={makeCard({ linkedSignals: [] })}
          project={project}
          onUpdate={vi.fn()}
          onLinkSignal={vi.fn()}
        />
      </Dialog>,
    );
    expect(screen.getByText(/No signals linked/i)).toBeTruthy();
  });

  it("shows external source section when card has linked ticket", () => {
    const card = makeCard({
      linked: { source: "task", id: "DEV-441", repo: "linear" },
    });
    render(
      <Dialog open>
        <CardDetailDialog
          card={card}
          project={project}
          onUpdate={vi.fn()}
          onLinkSignal={vi.fn()}
        />
      </Dialog>,
    );
    expect(screen.getByText(/EXTERNAL SOURCE/i)).toBeTruthy();
    expect(screen.getAllByText(/DEV-441/).length).toBeGreaterThan(0);
  });
});

// ── SignalLinkPickerDialog unit tests ─────────────────────────────────────────

describe("SignalLinkPickerDialog", () => {
  it("renders the dialog title and signal list", () => {
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={[]} onPick={vi.fn()} />
      </Dialog>,
    );
    expect(screen.getByText("Link a signal")).toBeTruthy();
    expect(screen.getByLabelText(/signal list/i)).toBeTruthy();
  });

  it("lists available signals", () => {
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={[]} onPick={vi.fn()} />
      </Dialog>,
    );
    expect(
      screen.getByText("Add retry logic to Slack adapter"),
    ).toBeTruthy();
  });

  it("filters signals by query", () => {
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={[]} onPick={vi.fn()} />
      </Dialog>,
    );
    const input = screen.getByLabelText(/search signals/i);
    fireEvent.change(input, { target: { value: "standup" } });
    expect(screen.getByText(/@here standup reminder/i)).toBeTruthy();
    expect(
      screen.queryByText("Add retry logic to Slack adapter"),
    ).toBeNull();
  });

  it("shows no-match message when filter yields nothing", () => {
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={[]} onPick={vi.fn()} />
      </Dialog>,
    );
    const input = screen.getByLabelText(/search signals/i);
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(screen.getByText(/No matching signals/i)).toBeTruthy();
  });

  it("calls onPick when a signal row is clicked", () => {
    const onPick = vi.fn();
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={[]} onPick={onPick} />
      </Dialog>,
    );
    fireEvent.click(screen.getByText("Add retry logic to Slack adapter"));
    expect(onPick).toHaveBeenCalledWith("s1");
  });

  it("hides already-linked signals", () => {
    render(
      <Dialog open>
        <SignalLinkPickerDialog alreadyLinked={["s1"]} onPick={vi.fn()} />
      </Dialog>,
    );
    expect(
      screen.queryByText("Add retry logic to Slack adapter"),
    ).toBeNull();
  });
});
