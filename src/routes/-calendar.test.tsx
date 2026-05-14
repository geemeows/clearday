// Calendar page — smoke, view-switch, event-kind, account-color, NOW cursor,
// conflict, Today→Day toggle, and multi-account rendering tests.

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
import type { StoredSignal } from "#/shared/signal";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const focusEvent: CalEvent = {
  id: "t-focus",
  day: 0,
  start: 9.0,
  end: 10.0,
  title: "Deep work block",
  kind: "focus",
  account: "acct-uuid-001",
};

const meetingEvent: CalEvent = {
  id: "t-meeting",
  day: 0,
  start: 10.0,
  end: 10.5,
  title: "Standup Meeting",
  kind: "meeting",
  account: "acct-uuid-002",
  attendees: ["Alice", "Bob"],
};

const breakEvent: CalEvent = {
  id: "t-break",
  day: 0,
  start: 13.0,
  end: 14.0,
  title: "Lunch break",
  kind: "break",
  account: "acct-uuid-003",
};

// Build a StoredSignal for a meeting event.
function makeSignal(
  id: string,
  title: string,
  accountId: string,
  startsAt: Date,
  durationMin = 60,
): StoredSignal {
  const endsAt = new Date(startsAt.getTime() + durationMin * 60000);
  return {
    id,
    provider: "google",
    kind: "meeting",
    source_id: id,
    title,
    url: null,
    payload: {
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    },
    requires_action: false,
    source_created_at: startsAt.toISOString(),
    unread_count: 0,
    created_at: startsAt.toISOString(),
    updated_at: startsAt.toISOString(),
    dismissed_at: null,
    priority: null,
    snoozed_until: null,
    alert_channels_override: null,
    tags: null,
    account_id: accountId,
  };
}

// ── CalendarPage smoke ────────────────────────────────────────────────────────

describe("CalendarPage", () => {
  it("renders the Calendar heading with empty signals", () => {
    render(<CalendarPage signals={[]} />);
    expect(screen.getByRole("heading", { name: /calendar/i })).toBeTruthy();
  });

  it("renders the view switcher buttons", () => {
    render(<CalendarPage signals={[]} />);
    expect(screen.getByText("Week")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    expect(screen.getByText("Month")).toBeTruthy();
    expect(screen.getByText("Agenda")).toBeTruthy();
  });

  it("shows empty state when no signals", () => {
    render(<CalendarPage signals={[]} />);
    expect(screen.getByText(/no calendar events yet/i)).toBeTruthy();
  });

  it("shows 'No calendar accounts connected' in legend when signals is empty", () => {
    render(<CalendarPage signals={[]} />);
    expect(
      screen.getByText(/no calendar accounts connected/i),
    ).toBeTruthy();
  });

  it("renders events from signals in week view", () => {
    const now = new Date();
    const signal = makeSignal("s1", "Team Standup", "acct-work", now);
    render(<CalendarPage signals={[signal]} />);
    // Event block should be visible in default week view
    expect(screen.getAllByTestId("event-block").length).toBeGreaterThan(0);
  });

  it("shows meta strip with focus and conflict info", () => {
    render(<CalendarPage signals={[]} />);
    expect(screen.getByText(/focus scheduled/i)).toBeTruthy();
  });
});

// ── Today button → Day view ───────────────────────────────────────────────────

describe("CalendarPage — Today→Day toggle", () => {
  it("clicking Today switches the view to Day", () => {
    render(<CalendarPage signals={[]} />);
    // Default is week view; meta strip should say "Week" range
    const todayBtn = screen.getByRole("button", { name: /today/i });
    fireEvent.click(todayBtn);
    // Day button should now be pressed
    const dayBtn = screen.getByRole("button", { name: "Day" });
    expect(dayBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("Day button aria-pressed is false in default week view", () => {
    render(<CalendarPage signals={[]} />);
    const dayBtn = screen.getByRole("button", { name: "Day" });
    expect(dayBtn.getAttribute("aria-pressed")).toBe("false");
  });
});

// ── Multi-account rendering ───────────────────────────────────────────────────

describe("CalendarPage — multi-account", () => {
  it("renders events from two different account_ids", () => {
    const now = new Date();
    const t1 = new Date(now);
    t1.setHours(9, 0, 0, 0);
    const t2 = new Date(now);
    t2.setHours(11, 0, 0, 0);
    const signals: StoredSignal[] = [
      makeSignal("e-work", "Work Standup", "acct-work-uuid", t1),
      makeSignal("e-personal", "Personal Appt", "acct-personal-uuid", t2),
    ];
    render(<CalendarPage signals={signals} />);
    const blocks = screen.getAllByTestId("event-block");
    expect(blocks.length).toBe(2);
  });

  it("shows account legend entries for each unique account_id", () => {
    const now = new Date();
    const t1 = new Date(now);
    t1.setHours(9, 0, 0, 0);
    const t2 = new Date(now);
    t2.setHours(11, 0, 0, 0);
    const signals: StoredSignal[] = [
      makeSignal("e-work", "Work Standup", "account-aaa", t1),
      makeSignal("e-personal", "Personal Appt", "account-bbb", t2),
    ];
    render(<CalendarPage signals={signals} />);
    // Legend should show truncated ids (last 8 chars)
    expect(screen.getByText("ount-aaa")).toBeTruthy();
    expect(screen.getByText("ount-bbb")).toBeTruthy();
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

// ── Conflict rendering ────────────────────────────────────────────────────────

describe("EventBlock — conflict rendering", () => {
  it("renders conflict pills when multiple events overlap on same day", () => {
    const now = new Date();
    const t = new Date(now);
    t.setHours(10, 0, 0, 0);
    const signals: StoredSignal[] = [
      makeSignal("c1", "Sprint planning", "acct-work", t, 60),
      makeSignal("c2", "1:1 Joon", "acct-work", t, 30),
    ];
    render(<CalendarPage signals={signals} />);
    const pills = screen.getAllByTestId("conflict-pill");
    expect(pills.length).toBe(2);
  });
});
