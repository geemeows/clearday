// Calendar page — smoke, view-switch, event-kind, NOW cursor, and conflict tests.

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
    }) => select({ location: { pathname: "/calendar" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import { CalendarPage } from "#/features/calendar/components/CalendarPage";
import { EventBlock } from "#/features/calendar/components/EventBlock";
import { NowCursor } from "#/features/calendar/components/AgendaGrid";
import type { CalEvent } from "#/features/calendar/components/cal-event";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const focusEvent: CalEvent = {
  id: "t-focus",
  day: 0,
  start: 9.0,
  end: 10.0,
  title: "Deep work block",
  kind: "focus",
  account: "cal-work",
};

const meetingEvent: CalEvent = {
  id: "t-meeting",
  day: 0,
  start: 10.0,
  end: 10.5,
  title: "Standup Meeting",
  kind: "meeting",
  account: "cal-work",
  attendees: ["Alice", "Bob"],
};

const breakEvent: CalEvent = {
  id: "t-break",
  day: 0,
  start: 13.0,
  end: 14.0,
  title: "Lunch break",
  kind: "break",
  account: "cal-personal",
};

// ── CalendarPage smoke ────────────────────────────────────────────────────────

describe("CalendarPage", () => {
  it("renders the Calendar heading", () => {
    render(<CalendarPage />);
    expect(screen.getByRole("heading", { name: /calendar/i })).toBeTruthy();
  });

  it("renders the account legend", () => {
    render(<CalendarPage />);
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.getByText("Team")).toBeTruthy();
  });

  it("renders the view switcher buttons", () => {
    render(<CalendarPage />);
    expect(screen.getByText("Week")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    expect(screen.getByText("Month")).toBeTruthy();
    expect(screen.getByText("Agenda")).toBeTruthy();
  });

  it("defaults to week view and shows event titles", () => {
    render(<CalendarPage />);
    const standups = screen.getAllByText(/standup/i);
    expect(standups.length).toBeGreaterThan(0);
  });

  it("switches to agenda view and lists all days", () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByText("Agenda"));
    expect(screen.getByText("Mon 4")).toBeTruthy();
    expect(screen.getByText("Fri 8")).toBeTruthy();
  });

  it("switches to month view and shows the month label", () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByText("Month"));
    expect(screen.getByText("May 2026")).toBeTruthy();
  });

  it("switches to day view and shows the day label", () => {
    render(<CalendarPage />);
    fireEvent.click(screen.getByText("Day"));
    expect(screen.getByText("Mon, May 4 2026")).toBeTruthy();
  });

  it("shows the meta strip with focus hours", () => {
    render(<CalendarPage />);
    expect(screen.getByText(/focus scheduled/i)).toBeTruthy();
  });

  it("shows conflict count in the meta strip", () => {
    render(<CalendarPage />);
    // getByText with substring = true to find the meta span that contains "conflict"
    expect(screen.getAllByText(/conflict/i).length).toBeGreaterThan(0);
  });
});

// ── EventBlock unit ───────────────────────────────────────────────────────────

describe("EventBlock", () => {
  it("renders a focus event button with data-kind=focus", () => {
    render(<EventBlock event={focusEvent} />);
    const btn = screen.getByRole("button", { name: "Deep work block" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("data-kind")).toBe("focus");
  });

  it("renders a meeting event", () => {
    render(<EventBlock event={meetingEvent} />);
    const btn = screen.getByRole("button", { name: "Standup Meeting" });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("data-kind")).toBe("meeting");
  });

  it("renders a break event with data-kind=break", () => {
    render(<EventBlock event={breakEvent} />);
    const btn = screen.getByRole("button", { name: "Lunch break" });
    expect(btn.getAttribute("data-kind")).toBe("break");
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<EventBlock event={focusEvent} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Deep work block" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders conflict pill when conflictSlot.of > 1", () => {
    render(
      <EventBlock event={focusEvent} conflictSlot={{ col: 0, of: 2 }} />,
    );
    const pill = screen.getByTestId("conflict-pill");
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/conflict 1\/2/i);
  });

  it("does not render conflict pill when no conflictSlot", () => {
    render(<EventBlock event={meetingEvent} />);
    expect(screen.queryByTestId("conflict-pill")).toBeFalsy();
  });
});

// ── NowCursor ─────────────────────────────────────────────────────────────────

describe("NowCursor", () => {
  it("renders with testid and aria-label", () => {
    render(
      <div style={{ position: "relative" }}>
        <NowCursor />
      </div>,
    );
    const cursor = screen.getByTestId("now-cursor");
    expect(cursor).toBeTruthy();
    expect(cursor.getAttribute("aria-label")).toBe("Current time");
  });
});

// ── EventDialog ───────────────────────────────────────────────────────────────

describe("EventDialog", () => {
  it("renders nothing visible when event is null", async () => {
    const { EventDialog } = await import(
      "#/features/calendar/components/EventDialog"
    );
    render(<EventDialog event={null} onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/standup/i)).toBeFalsy();
  });

  it("renders event title when open", async () => {
    const { EventDialog } = await import(
      "#/features/calendar/components/EventDialog"
    );
    render(<EventDialog event={meetingEvent} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Standup Meeting")).toBeTruthy();
  });

  it("shows attendees when present", async () => {
    const { EventDialog } = await import(
      "#/features/calendar/components/EventDialog"
    );
    render(<EventDialog event={meetingEvent} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("disables Update agenda button for focus events", async () => {
    const { EventDialog } = await import(
      "#/features/calendar/components/EventDialog"
    );
    render(<EventDialog event={focusEvent} onOpenChange={vi.fn()} />);
    const btn = screen.getByRole("button", {
      name: /update meeting agenda/i,
    });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onOpenChange(false) when Close is clicked", async () => {
    const { EventDialog } = await import(
      "#/features/calendar/components/EventDialog"
    );
    const onOpenChange = vi.fn();
    render(<EventDialog event={meetingEvent} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ── Conflict rendering in CalendarPage ───────────────────────────────────────

describe("CalendarPage — conflict rendering", () => {
  it("renders conflict pills on conflicting Tuesday events", () => {
    render(<CalendarPage />);
    // Fixture has Sprint planning + 1:1 Joon both conflict=true on day 1.
    const pills = screen.getAllByTestId("conflict-pill");
    expect(pills.length).toBe(2);
  });
});
