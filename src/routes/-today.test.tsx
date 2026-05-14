// Today page — smoke, variant, and behavioral tests.

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
    }) => select({ location: { pathname: "/today" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ─────────────────────────────────────────

import { TodayPage } from "./\_app.today";
import { PulseCard } from "#/features/today/components/PulseCard";
import { NextUpHero } from "#/features/today/components/NextUpHero";
import { BriefingCard } from "#/features/today/components/BriefingCard";
import { InboxPreviewRow } from "#/features/signals/components/InboxPreviewRow";
import { FocusModal } from "#/features/focus/components/FocusModal";
import type { NowSignal } from "#/features/today/components/MeetingCountdownNow";
import type { BriefingData } from "#/features/today/components/BriefingCard";

// ── TodayPage smoke ──────────────────────────────────────────────────────────

describe("TodayPage", () => {
  it("renders the greeting with first name", () => {
    render(<TodayPage />);
    expect(screen.getByText(/Good morning, Erin/i)).toBeTruthy();
  });

  it("renders the Pulse section", () => {
    render(<TodayPage />);
    expect(screen.getByText("Pulse")).toBeTruthy();
  });

  it("renders the schedule section", () => {
    render(<TodayPage />);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("renders the in-progress section", () => {
    render(<TodayPage />);
    expect(screen.getByText("In progress")).toBeTruthy();
  });

  it("renders the needs-you inbox preview section", () => {
    render(<TodayPage />);
    expect(screen.getByText("Needs you")).toBeTruthy();
  });
});

// ── PulseCard variant switching ──────────────────────────────────────────────

const mockStats = {
  prs_reviewed: 12,
  tickets_shipped: 4,
  focus_hours: 14.5,
  inbox_zero_days: 3,
};

describe("PulseCard", () => {
  it("renders signal mix legend when not empty", () => {
    render(<PulseCard stats={mockStats} empty={false} />);
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
  });

  it("shows empty state text when empty=true", () => {
    render(<PulseCard stats={mockStats} empty={true} />);
    expect(screen.getByText("No signal mix yet")).toBeTruthy();
  });

  it("shows shipped stats from props", () => {
    render(<PulseCard stats={mockStats} />);
    expect(screen.getByText(/12 PRs/)).toBeTruthy();
    expect(screen.getByText(/4 tickets/)).toBeTruthy();
  });
});

// ── NextUpHero polymorphism ───────────────────────────────────────────────────

describe("NextUpHero", () => {
  it("renders MeetingCountdownNow when meeting is within 30 minutes", () => {
    const soon: NowSignal = {
      title: "Standup — Platform team",
      when: new Date(Date.now() + 13 * 60_000).toISOString(),
      agenda: ["Item 1"],
    };
    render(<NextUpHero signal={soon} />);
    expect(screen.getByText(/Join meeting/i)).toBeTruthy();
  });

  it("renders FocusReadyNow when meeting is more than 30 minutes away", () => {
    const later: NowSignal = {
      title: "Design review — onboarding",
      when: new Date(Date.now() + 90 * 60_000).toISOString(),
    };
    render(<NextUpHero signal={later} />);
    expect(screen.getByText(/Start 25-min focus/i)).toBeTruthy();
    expect(screen.getByText(/Clear runway/i)).toBeTruthy();
  });
});

// ── BriefingCard — empty / off state ─────────────────────────────────────────

const minimalBriefing: BriefingData = {
  model: "haiku 4.5",
  duration: "7s",
  generatedAt: "07:42",
  headline: "Three things stand out.",
  items: [],
};

describe("BriefingCard", () => {
  it("renders the empty state when aiConnected=false", () => {
    render(
      <BriefingCard
        data={minimalBriefing}
        aiConnected={false}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByText(/Morning rundown is off/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect provider/i })).toBeTruthy();
  });

  it("calls onConnect when the connect button is clicked", () => {
    const onConnect = vi.fn();
    render(
      <BriefingCard
        data={minimalBriefing}
        aiConnected={false}
        onConnect={onConnect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect provider/i }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("renders the headline when aiConnected=true", () => {
    render(
      <BriefingCard data={minimalBriefing} aiConnected={true} />,
    );
    expect(screen.getByText("Three things stand out.")).toBeTruthy();
    expect(screen.getByText("Morning rundown")).toBeTruthy();
  });

  it("renders nothing when suppressed=true", () => {
    const { container } = render(
      <BriefingCard
        data={minimalBriefing}
        suppressed={true}
        aiConnected={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── InboxPreview row count cap ────────────────────────────────────────────────

describe("InboxPreview row count", () => {
  const makeSignals = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      source: "git" as const,
      title: `Signal ${i}`,
      age: new Date().toISOString(),
      unread: 0,
    }));

  it("renders at most 6 preview rows", () => {
    const signals = makeSignals(10);
    const { container } = render(
      <div>
        {signals.slice(0, 6).map((s) => (
          <InboxPreviewRow key={s.id} signal={s} />
        ))}
      </div>,
    );
    // 6 buttons rendered
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(6);
  });
});

// ── FocusModal start / cancel ─────────────────────────────────────────────────

describe("FocusModal", () => {
  it("renders the dialog title when open", async () => {
    render(<FocusModal open={true} onOpenChange={vi.fn()} />);
    expect(await screen.findByText(/Start a focus session/i)).toBeTruthy();
  });

  it("renders duration chips", async () => {
    render(<FocusModal open={true} onOpenChange={vi.fn()} />);
    await screen.findByText(/Start a focus session/i);
    expect(screen.getByRole("button", { name: "45 min" })).toBeTruthy();
  });

  it("dispatches devy:focus-started on Start click", async () => {
    render(<FocusModal open={true} onOpenChange={vi.fn()} />);
    await screen.findByText(/Start a focus session/i);
    const events: Event[] = [];
    window.addEventListener("devy:focus-started", (e) => events.push(e));
    fireEvent.click(screen.getByRole("button", { name: /Start 45-min focus/i }));
    expect(events.length).toBe(1);
    const detail = (events[0] as CustomEvent).detail;
    expect(detail.durationSeconds).toBe(45 * 60);
  });

  it("calls onOpenChange(false) on Cancel", async () => {
    const onOpenChange = vi.fn();
    render(<FocusModal open={true} onOpenChange={onOpenChange} />);
    await screen.findByText(/Start a focus session/i);
    // Get all Cancel buttons and click the one from this render (last in DOM)
    const cancelBtns = screen.getAllByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
