import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toMeetingEvent } from "#/lib/calendar-view";
import type { StoredSignal } from "#/lib/next-up";
import { CalendarView } from "#/routes/_app.calendar";

const signal = (args: {
  id: string;
  starts_at: string;
  ends_at: string;
  title?: string;
  is_focus?: boolean;
}): StoredSignal => ({
  id: args.id,
  provider: "google",
  kind: "meeting",
  source_id: args.id,
  title: args.title ?? "Standup",
  url: "https://calendar.google.com/event",
  payload: {
    starts_at: args.starts_at,
    ends_at: args.ends_at,
    video_link: "https://meet.google.com/abc",
    linked_items: [],
    ...(args.is_focus ? { is_focus: true } : {}),
  },
  requires_action: false,
  source_created_at: args.starts_at,
  dismissed_at: null,
});

const ev = (
  id: string,
  start: string,
  end: string,
  opts: { title?: string; is_focus?: boolean } = {},
) => {
  const e = toMeetingEvent(
    signal({ id, starts_at: start, ends_at: end, ...opts }),
  );
  if (!e) throw new Error("toMeetingEvent returned null");
  return e;
};

describe("CalendarView", () => {
  it("renders today's events in the day view by default and surfaces Next:", () => {
    const now = new Date("2026-05-04T11:00:00.000Z");
    const events = [
      ev("a", "2026-05-04T13:00:00.000Z", "2026-05-04T13:30:00.000Z", {
        title: "Design review",
      }),
      ev("b", "2026-05-04T15:00:00.000Z", "2026-05-04T15:30:00.000Z"),
    ];
    render(<CalendarView events={events} now={now} />);
    const list = screen.getByRole("list", { name: "Day events" });
    expect(within(list).getAllByRole("article")).toHaveLength(2);
    const today = screen.getByRole("article", { name: "Today" });
    expect(today.textContent).toContain("Design review");
    expect(today.textContent).toMatch(/Next:/);
  });

  it("switches to week view and renders 7 day buckets", () => {
    const now = new Date("2026-05-04T11:00:00.000Z");
    const events = [
      ev("a", "2026-05-04T13:00:00.000Z", "2026-05-04T13:30:00.000Z"),
      ev("b", "2026-05-06T13:00:00.000Z", "2026-05-06T13:30:00.000Z"),
    ];
    render(<CalendarView events={events} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Week" }));
    const grid = screen.getByLabelText("Week grid");
    expect(grid.children).toHaveLength(7);
  });

  it("renders a Conflict card when two events overlap", () => {
    const now = new Date("2026-05-04T08:00:00.000Z");
    const events = [
      ev("a", "2026-05-04T13:00:00.000Z", "2026-05-04T14:00:00.000Z", {
        title: "Standup",
      }),
      ev("b", "2026-05-04T13:30:00.000Z", "2026-05-04T14:30:00.000Z", {
        title: "Design review",
      }),
    ];
    render(<CalendarView events={events} now={now} />);
    const conflict = screen.getByRole("article", { name: "Conflict" });
    expect(conflict.textContent).toContain("Standup");
    expect(conflict.textContent).toContain("Design review");
  });

  it("renders Focus blocks card with upcoming focus events only", () => {
    const now = new Date("2026-05-04T08:00:00.000Z");
    const events = [
      ev("focus", "2026-05-04T13:00:00.000Z", "2026-05-04T15:00:00.000Z", {
        title: "Focus block",
      }),
      ev("standup", "2026-05-04T15:00:00.000Z", "2026-05-04T15:15:00.000Z"),
    ];
    render(<CalendarView events={events} now={now} />);
    const focus = screen.getByRole("article", { name: "Focus blocks" });
    expect(focus.textContent).toContain("Focus block");
    expect(focus.textContent).not.toContain("Standup");
  });

  it("Today / Prev / Next move the anchor", () => {
    const now = new Date("2026-05-04T11:00:00.000Z");
    const events = [
      ev("today", "2026-05-04T13:00:00.000Z", "2026-05-04T13:30:00.000Z", {
        title: "Today's meeting",
      }),
      ev("tomorrow", "2026-05-05T13:00:00.000Z", "2026-05-05T13:30:00.000Z", {
        title: "Tomorrow's meeting",
      }),
    ];
    render(<CalendarView events={events} now={now} />);
    expect(screen.getByLabelText("Day events").textContent).toContain(
      "Today's meeting",
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Day events").textContent).toContain(
      "Tomorrow's meeting",
    );
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByLabelText("Day events").textContent).toContain(
      "Today's meeting",
    );
  });

  it("renders an empty state when there are no events on the day", () => {
    const now = new Date("2026-05-04T11:00:00.000Z");
    render(<CalendarView events={[]} now={now} />);
    expect(screen.getByText(/No meetings on this day/i)).toBeTruthy();
  });
});
