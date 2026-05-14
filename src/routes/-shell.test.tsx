// Shell smoke tests — sidebar renders, Cmd-K opens, focus block, routing guards.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

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

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ integrations: [] }),
}));

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: {
      user: {
        email: "user@example.com",
        user_metadata: { full_name: "Test User" },
      },
    },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

// Mock TanStack Router hooks used inside the sidebar
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
    }) => select({ location: { pathname: "/today" } }),
  };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { NavigationSidebar } from "#/app/NavigationSidebar";
import { CommandPalette } from "#/app/CommandPalette";
import { FocusActiveBlock } from "#/features/focus/components/FocusActiveBlock";

// ─── NavigationSidebar ────────────────────────────────────────────────────────

describe("NavigationSidebar", () => {
  it("renders all primary nav items", () => {
    render(<NavigationSidebar />);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("Career")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Automations")).toBeTruthy();
  });

  it("marks Today as active when location is /today", () => {
    render(<NavigationSidebar />);
    const todayBtn = screen.getByRole("button", { name: /today/i });
    expect(todayBtn.getAttribute("aria-current")).toBe("page");
  });

  it("renders the Devy brand in the sidebar", () => {
    render(<NavigationSidebar />);
    expect(screen.getByText("Devy")).toBeTruthy();
  });

  it("renders the search trigger with ⌘K hint", () => {
    render(<NavigationSidebar />);
    expect(screen.getByRole("button", { name: /search/i })).toBeTruthy();
    expect(screen.getByText("⌘K")).toBeTruthy();
  });

  it("renders the Start focus session button", () => {
    render(<NavigationSidebar />);
    expect(
      screen.getByRole("button", { name: /start focus session/i }),
    ).toBeTruthy();
  });

  it("renders the account menu trigger with user name", () => {
    render(<NavigationSidebar />);
    expect(screen.getByRole("button", { name: /account menu/i })).toBeTruthy();
    expect(screen.getByText("Test User")).toBeTruthy();
  });

  it("shows FocusActiveBlock when devy:focus-started event fires", async () => {
    render(<NavigationSidebar />);
    window.dispatchEvent(
      new CustomEvent("devy:focus-started", {
        detail: { durationSeconds: 2700 },
      }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Focus session active")).toBeTruthy();
    });
  });

  it("hides FocusActiveBlock when devy:focus-ended event fires", async () => {
    render(<NavigationSidebar />);
    window.dispatchEvent(
      new CustomEvent("devy:focus-started", {
        detail: { durationSeconds: 2700 },
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Focus session active")).toBeTruthy(),
    );
    window.dispatchEvent(new CustomEvent("devy:focus-ended"));
    await waitFor(() => {
      expect(screen.queryByLabelText("Focus session active")).toBeNull();
    });
  });
});

// ─── CommandPalette ───────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  beforeEach(() => {
    render(<CommandPalette />);
  });

  it("opens when devy:open-cmdk event fires", async () => {
    window.dispatchEvent(new CustomEvent("devy:open-cmdk"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("shows navigation command items when open", async () => {
    window.dispatchEvent(new CustomEvent("devy:open-cmdk"));
    await screen.findByRole("dialog");
    expect(screen.getByText("Go to Today")).toBeTruthy();
    expect(screen.getByText("Go to Inbox")).toBeTruthy();
  });

  it("shows AI command items when open", async () => {
    window.dispatchEvent(new CustomEvent("devy:open-cmdk"));
    await screen.findByRole("dialog");
    expect(screen.getByText("Start focus session")).toBeTruthy();
  });

  it("opens when ⌘K is pressed", async () => {
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

// ─── FocusActiveBlock ─────────────────────────────────────────────────────────

describe("FocusActiveBlock", () => {
  it("renders remaining time and progress bar", () => {
    render(
      <FocusActiveBlock
        durationSeconds={2700}
        startedAt={Date.now()}
      />,
    );
    expect(screen.getByText(/remaining/i)).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("shows FOCUS · ACTIVE label", () => {
    render(
      <FocusActiveBlock
        durationSeconds={2700}
        startedAt={Date.now()}
      />,
    );
    expect(screen.getByText(/focus · active/i)).toBeTruthy();
  });

  it("shows Slack DND / Calendar busy status line", () => {
    render(
      <FocusActiveBlock
        durationSeconds={2700}
        startedAt={Date.now()}
      />,
    );
    expect(screen.getByText(/slack dnd on/i)).toBeTruthy();
  });

  it("aria-label marks the block as active focus session", () => {
    render(
      <FocusActiveBlock
        durationSeconds={2700}
        startedAt={Date.now()}
      />,
    );
    expect(screen.getByLabelText("Focus session active")).toBeTruthy();
  });
});
