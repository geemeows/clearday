// Automations page — smoke, list, detail, builder, and mode-transition tests.

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
    }) => select({ location: { pathname: "/automations" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import {
  AutomationsPage,
  AutomationListCard,
  AutomationDetail,
  AutomationBuilder,
  RunsView,
} from "#/features/automations/components/AutomationsPage";
import type { AutomationItem } from "#/features/automations/components/AutomationsPage";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAutomation(overrides: Partial<AutomationItem> = {}): AutomationItem {
  return {
    id: "test-a1",
    name: "Test automation",
    enabled: true,
    dryRun: false,
    priority: 10,
    trigger: { kind: "signal_ingested" },
    predicates: [
      { field: "signal.source", op: "equals", value: "github" },
    ],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "channel",
          channel: "#test",
          body: "hello {{signal.title}}",
        },
      },
    ],
    stats: {
      lastRunAt: "2026-05-07T09:42:00Z",
      lastStatus: "succeeded",
      totalRuns: 5,
      fail7d: 0,
    },
    ...overrides,
  };
}

// ── AutomationsPage smoke ─────────────────────────────────────────────────────

describe("AutomationsPage smoke", () => {
  it("renders the page heading", () => {
    render(<AutomationsPage />);
    expect(screen.getByText("Automations")).toBeTruthy();
  });

  it("shows automation cards in list view", () => {
    render(<AutomationsPage />);
    expect(screen.getByText("Post my PRs to #reviews")).toBeTruthy();
    expect(screen.getByText("Focus auto-reply")).toBeTruthy();
  });

  it("shows active / paused / dry-run stats text", () => {
    render(<AutomationsPage />);
    expect(screen.getByText(/active/)).toBeTruthy();
    expect(screen.getByText(/paused/)).toBeTruthy();
    expect(screen.getByText(/dry-run/)).toBeTruthy();
  });

  it("renders the New automation button", () => {
    render(<AutomationsPage />);
    expect(
      screen.getByRole("button", { name: /new automation/i }),
    ).toBeTruthy();
  });

  it("renders the filter input", () => {
    render(<AutomationsPage />);
    expect(
      screen.getByPlaceholderText(/filter automations/i),
    ).toBeTruthy();
  });
});

// ── List filter ───────────────────────────────────────────────────────────────

describe("AutomationsPage list filter", () => {
  it("hides cards that don't match the filter", () => {
    render(<AutomationsPage />);
    const input = screen.getByPlaceholderText(/filter automations/i);
    fireEvent.change(input, { target: { value: "Focus" } });
    expect(screen.getByText("Focus auto-reply")).toBeTruthy();
    expect(
      screen.queryByText("Post my PRs to #reviews"),
    ).toBeNull();
  });

  it("restores all cards when filter is cleared", () => {
    render(<AutomationsPage />);
    const input = screen.getByPlaceholderText(/filter automations/i);
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(
      screen.queryByText("Post my PRs to #reviews"),
    ).toBeNull();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Post my PRs to #reviews")).toBeTruthy();
  });
});

// ── Mode transitions ──────────────────────────────────────────────────────────

describe("AutomationsPage mode transitions", () => {
  it("navigates to detail when a card is clicked", () => {
    render(<AutomationsPage />);
    const card = screen.getByRole("button", {
      name: /open automation: post my prs/i,
    });
    fireEvent.click(card);
    // detail view renders WHEN / THEN labels (may appear multiple times across sentence summary + section labels)
    expect(screen.getAllByText("WHEN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("THEN").length).toBeGreaterThan(0);
  });

  it("breadcrumb returns to list from detail", () => {
    render(<AutomationsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /open automation: post my prs/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Automations" }));
    expect(screen.getByPlaceholderText(/filter automations/i)).toBeTruthy();
  });

  it("navigates to builder via Edit button", () => {
    render(<AutomationsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /open automation: post my prs/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText("Automation name")).toBeTruthy();
  });

  it("New automation button opens builder with blank automation", () => {
    render(<AutomationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /new automation/i }));
    const nameInput = screen.getByLabelText(
      "Automation name",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Untitled automation");
  });

  it("navigates to runs view via Full history button", () => {
    render(<AutomationsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /open automation: post my prs/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /full history/i }));
    expect(screen.getByText(/· runs/)).toBeTruthy();
  });
});

// ── AutomationListCard unit ───────────────────────────────────────────────────

describe("AutomationListCard", () => {
  it("renders automation name", () => {
    const a = makeAutomation({ name: "My test rule" });
    render(
      <AutomationListCard a={a} onClick={vi.fn()} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("My test rule")).toBeTruthy();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const a = makeAutomation();
    render(
      <AutomationListCard a={a} onClick={onClick} onToggle={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open automation/i }));
    expect(onClick).toHaveBeenCalled();
  });

  it("shows DRY-RUN badge when dryRun is true", () => {
    const a = makeAutomation({ dryRun: true });
    render(
      <AutomationListCard a={a} onClick={vi.fn()} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("DRY-RUN")).toBeTruthy();
  });

  it("shows FAIL badge when last status is failed", () => {
    const a = makeAutomation({
      stats: {
        lastRunAt: "2026-05-07T09:00:00Z",
        lastStatus: "failed",
        totalRuns: 3,
        fail7d: 1,
      },
    });
    render(
      <AutomationListCard a={a} onClick={vi.fn()} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("FAIL")).toBeTruthy();
  });

  it("shows trigger label in card", () => {
    const a = makeAutomation();
    render(
      <AutomationListCard a={a} onClick={vi.fn()} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("SIGNAL INGESTED")).toBeTruthy();
  });
});

// ── AutomationDetail unit ─────────────────────────────────────────────────────

describe("AutomationDetail", () => {
  it("renders automation name in header", () => {
    const a = makeAutomation({ name: "My rule" });
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "My rule" })).toBeTruthy();
  });

  it("renders WHEN / IF / THEN sections", () => {
    const a = makeAutomation();
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // WHEN / IF / THEN may appear in both the sentence summary and the section labels
    expect(screen.getAllByText("WHEN").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("THEN").length).toBeGreaterThan(0);
  });

  it("calls onEdit when Edit is clicked", () => {
    const onEdit = vi.fn();
    const a = makeAutomation();
    render(
      <AutomationDetail
        automation={a}
        onEdit={onEdit}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("calls onShowRuns when Full history is clicked", () => {
    const onShowRuns = vi.fn();
    const a = makeAutomation();
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={onShowRuns}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /full history/i }));
    expect(onShowRuns).toHaveBeenCalled();
  });

  it("shows PAUSED chip when disabled", () => {
    const a = makeAutomation({ enabled: false });
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("PAUSED")).toBeTruthy();
  });

  it("shows deferred banner when an action is not wired", () => {
    const a = makeAutomation({
      actions: [{ kind: "transition_ticket", config: { to: "Done" } }],
    });
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/not-yet-wired action/i)).toBeTruthy();
  });

  it("shows live preview section", () => {
    const a = makeAutomation();
    render(
      <AutomationDetail
        automation={a}
        onEdit={vi.fn()}
        onShowRuns={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("LIVE PREVIEW")).toBeTruthy();
  });
});

// ── AutomationBuilder unit ────────────────────────────────────────────────────

describe("AutomationBuilder", () => {
  it("shows name input with initial name", () => {
    const a = makeAutomation({ name: "My rule" });
    render(
      <AutomationBuilder
        automation={a}
        isNew={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText("Automation name") as HTMLInputElement).value,
    ).toBe("My rule");
  });

  it("shows NEW label for new automations", () => {
    const a = makeAutomation();
    render(
      <AutomationBuilder
        automation={a}
        isNew={true}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("NEW")).toBeTruthy();
  });

  it("Save button is disabled when no actions", () => {
    const a = makeAutomation({ actions: [] });
    render(
      <AutomationBuilder
        automation={a}
        isNew={true}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /create automation/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("calls onSave with updated automation when Save is clicked", () => {
    const onSave = vi.fn();
    const a = makeAutomation();
    render(
      <AutomationBuilder
        automation={a}
        isNew={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: a.name }),
    );
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    const a = makeAutomation();
    render(
      <AutomationBuilder
        automation={a}
        isNew={false}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders all 5 trigger kind options", () => {
    const a = makeAutomation();
    render(
      <AutomationBuilder
        automation={a}
        isNew={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Trigger labels may appear in both picker buttons and sentence summary pills
    expect(screen.getAllByText("Signal ingested").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Signal state changed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Focus session started").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Focus session ended").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
  });
});

// ── RunsView unit ─────────────────────────────────────────────────────────────

describe("RunsView", () => {
  it("renders runs heading with automation name", () => {
    const a = makeAutomation({ name: "My rule" });
    render(<RunsView automation={a} />);
    expect(screen.getByText(/My rule · runs/)).toBeTruthy();
  });

  it("renders histogram section", () => {
    const a = makeAutomation();
    render(<RunsView automation={a} />);
    expect(screen.getByText("LAST 14 DAYS")).toBeTruthy();
  });

  it("shows fixture runs for automation a1", () => {
    const a = makeAutomation({ id: "a1", name: "Post my PRs to #reviews" });
    render(<RunsView automation={a} />);
    expect(screen.getByText(/signal:s_4471/)).toBeTruthy();
  });
});
