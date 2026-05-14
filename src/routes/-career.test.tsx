// Career page — smoke, tab switching, score dots, and dialog tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

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
    session: {
      user: {
        email: "erin@example.com",
        user_metadata: { full_name: "Erin Test" },
      },
    },
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
    }) => select({ location: { pathname: "/career" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ─────────────────────────────────────────

import { CareerPage } from "#/features/career/components/CareerPage";
import { CareerEmpty } from "#/features/career/components/CareerEmpty";
import { ScoreDots } from "#/features/career/components/ScoreDots";
import { DevPlanSection } from "#/features/career/components/DevPlanSection";

// ── CareerPage smoke ─────────────────────────────────────────────────────────

describe("CareerPage", () => {
  it("renders the level title", () => {
    render(<CareerPage />);
    expect(screen.getAllByText(/Senior Software Engineer/i).length).toBeGreaterThan(0);
  });

  it("renders the Career model tab", () => {
    render(<CareerPage />);
    expect(screen.getByText(/Career model/i)).toBeTruthy();
  });

  it("renders the Development plan tab", () => {
    render(<CareerPage />);
    expect(screen.getByText(/Development plan/i)).toBeTruthy();
  });

  it("renders the score legend strip", () => {
    render(<CareerPage />);
    expect(screen.getByText(/Emerging/i)).toBeTruthy();
    expect(screen.getByText(/Exemplary/i)).toBeTruthy();
  });

  it("renders the first competency name", () => {
    render(<CareerPage />);
    expect(screen.getAllByText(/Technical Excellence/i).length).toBeGreaterThan(0);
  });

  it("shows the 'Add competency' button", () => {
    render(<CareerPage />);
    expect(screen.getByText(/Add competency/i)).toBeTruthy();
  });
});

// ── Tab switching ────────────────────────────────────────────────────────────

describe("CareerPage tab switching", () => {
  it("switches to dev plan tab and shows add button", () => {
    render(<CareerPage />);
    fireEvent.click(screen.getByText(/Development plan/i));
    expect(screen.getByRole("button", { name: /Add plan item/i })).toBeTruthy();
  });
});

// ── CareerEmpty ──────────────────────────────────────────────────────────────

describe("CareerEmpty", () => {
  it("renders the recommended template option", () => {
    render(<CareerEmpty />);
    expect(screen.getByText(/Start from the Senior Engineer template/i)).toBeTruthy();
    expect(screen.getByText(/RECOMMENDED/i)).toBeTruthy();
  });

  it("renders the blank start option", () => {
    render(<CareerEmpty />);
    expect(screen.getByText(/Start blank/i)).toBeTruthy();
  });

  it("calls onSeed when clicking the template card", () => {
    const onSeed = vi.fn();
    render(<CareerEmpty onSeed={onSeed} />);
    fireEvent.click(screen.getByText(/Start from the Senior Engineer template/i).closest("button")!);
    expect(onSeed).toHaveBeenCalledOnce();
  });

  it("calls onBlank when clicking the blank card", () => {
    const onBlank = vi.fn();
    render(<CareerEmpty onBlank={onBlank} />);
    fireEvent.click(screen.getByText(/Start blank/i).closest("button")!);
    expect(onBlank).toHaveBeenCalledOnce();
  });
});

// ── ScoreDots ────────────────────────────────────────────────────────────────

describe("ScoreDots", () => {
  it("renders 4 radio buttons", () => {
    render(<ScoreDots value={2} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(4);
  });

  it("calls onChange when a radio is clicked", () => {
    const onChange = vi.fn();
    render(<ScoreDots value={1} onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("renders within a radiogroup", () => {
    render(<ScoreDots value={2} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });
});

// ── DevPlanSection ───────────────────────────────────────────────────────────

describe("DevPlanSection", () => {
  it("shows empty state add button when no items", () => {
    render(<DevPlanSection items={[]} criteria={[]} />);
    expect(screen.getByText(/Add your first development plan item/i)).toBeTruthy();
  });

  it("renders plan items", () => {
    const items = [
      {
        id: "dp1",
        title: "Lead a system design session",
        start: "2026-06-01",
        due: "2026-07-01",
        status: "in_progress" as const,
        criterion_id: null,
      },
    ];
    render(<DevPlanSection items={items} criteria={[]} />);
    expect(screen.getByText(/Lead a system design session/i)).toBeTruthy();
    expect(screen.getByText(/In progress/i)).toBeTruthy();
  });
});
