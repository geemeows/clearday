import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MeetingEvent } from "#/features/signals/views/calendar";
import { CalendarView, type WeekEvent } from "#/routes/_app.calendar";
import type { StoredSignal } from "#/shared/signal";

const ev = (
  id: string,
  day: number,
  start: number,
  end: number,
  opts: { kind?: WeekEvent["kind"]; title?: string } = {},
): WeekEvent => ({
  id,
  day,
  start,
  end,
  kind: opts.kind ?? "meeting",
  title: opts.title ?? id,
});

describe("CalendarView", () => {
  it("renders events with kind-specific color", () => {
    const now = new Date(2026, 4, 4, 11, 0); // Mon May 4 2026
    const events = [
      ev("focus", 0, 9 * 60, 11 * 60, { kind: "focus", title: "Deep work" }),
      ev("meet", 1, 10 * 60, 11 * 60, { kind: "meeting", title: "Standup" }),
    ];
    render(<CalendarView events={events} now={now} />);
    const focusBlock = screen.getByRole("article", { name: "Deep work" });
    expect(focusBlock.dataset.kind).toBe("focus");
    expect(focusBlock.className).toContain("bg-foreground");
    const meetBlock = screen.getByRole("article", { name: "Standup" });
    expect(meetBlock.dataset.kind).toBe("meeting");
    expect(meetBlock.className).toContain("bg-primary");
  });

  it("renders the conflict banner when two events overlap on the same day", () => {
    const now = new Date(2026, 4, 4, 11, 0);
    const events = [
      ev("a", 1, 10 * 60, 11 * 60, { title: "Sprint planning" }),
      ev("b", 1, 10 * 60 + 30, 11 * 60 + 30, { title: "1:1 with Joon" }),
    ];
    render(<CalendarView events={events} now={now} />);
    const banner = screen.getByRole("article", { name: "Conflict" });
    expect(banner.textContent).toContain("Sprint planning");
    expect(banner.textContent).toContain("1:1 with Joon");
    expect(
      within(banner).getByRole("button", { name: "Decline" }),
    ).toBeTruthy();
    expect(
      within(banner).getByRole("button", { name: "Reschedule" }),
    ).toBeTruthy();
  });

  it("does not render a conflict banner when events do not overlap", () => {
    const now = new Date(2026, 4, 4, 11, 0);
    const events = [ev("a", 0, 9 * 60, 10 * 60), ev("b", 1, 9 * 60, 10 * 60)];
    render(<CalendarView events={events} now={now} />);
    expect(screen.queryByRole("article", { name: "Conflict" })).toBeNull();
  });

  it("flags conflicting events with the data-conflict attribute", () => {
    const now = new Date(2026, 4, 4, 11, 0);
    const events = [
      ev("a", 1, 10 * 60, 11 * 60, { title: "A" }),
      ev("b", 1, 10 * 60 + 30, 11 * 60 + 30, { title: "B" }),
    ];
    render(<CalendarView events={events} now={now} />);
    expect(
      screen.getByRole("article", { name: "A" }).dataset.conflict,
    ).toBeDefined();
    expect(
      screen.getByRole("article", { name: "B" }).dataset.conflict,
    ).toBeDefined();
  });

  it("renders the now line only on today's column", () => {
    // Tuesday 2026-05-05 at 10:00 local — Tuesday is column index 1.
    const now = new Date(2026, 4, 5, 10, 0);
    render(<CalendarView events={[]} now={now} />);
    const nowLines = screen.getAllByLabelText("Now");
    expect(nowLines).toHaveLength(1);
    const col = nowLines[0].closest("[data-day-col]") as HTMLElement;
    expect(col.dataset.dayCol).toBe("1");
    expect(col.dataset.today).toBe("true");
  });

  it("does not render a now line on weekend days", () => {
    // Saturday 2026-05-09 — outside Mon–Fri grid.
    const now = new Date(2026, 4, 9, 10, 0);
    render(<CalendarView events={[]} now={now} />);
    expect(screen.queryByLabelText("Now")).toBeNull();
  });

  it("renders Day / Week / Month tabs with Week active by default", () => {
    const now = new Date(2026, 4, 4, 11, 0);
    render(<CalendarView events={[]} now={now} />);
    const list = screen.getByRole("tablist", { name: "View mode" });
    expect(within(list).getByRole("tab", { name: /day/i })).toBeTruthy();
    expect(
      within(list).getByRole("tab", { name: /week/i, selected: true }),
    ).toBeTruthy();
    expect(within(list).getByRole("tab", { name: /month/i })).toBeTruthy();
    expect(screen.getByLabelText("Week grid")).toBeTruthy();
  });

  it("switches to the day grid when the Day tab is clicked", () => {
    const now = new Date(2026, 4, 4, 11, 0); // Mon
    const events = [
      ev("focus", 0, 9 * 60, 11 * 60, { kind: "focus", title: "Deep work" }),
      ev("other", 1, 10 * 60, 11 * 60, { title: "Standup" }),
    ];
    render(<CalendarView events={events} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: /day/i }));
    expect(screen.getByLabelText("Day grid")).toBeTruthy();
    expect(screen.queryByLabelText("Week grid")).toBeNull();
    expect(screen.getByRole("article", { name: "Deep work" })).toBeTruthy();
    // Tuesday's event should not appear in Monday's day view.
    expect(screen.queryByRole("article", { name: "Standup" })).toBeNull();
  });

  it("renders a 6×7 month grid when Month tab is clicked", () => {
    const now = new Date(2026, 4, 4, 11, 0);
    const meeting = (id: string, starts_at: string): MeetingEvent => ({
      signal: {
        id,
        provider: "google",
        kind: "meeting",
        source_id: id,
        title: id,
        url: null,
        priority: 0,
        score: 0,
        scored_at: null,
        bucket: null,
        bucket_at: null,
        dismissed_at: null,
        snoozed_until: null,
        completed_at: null,
        archived_at: null,
        created_at: starts_at,
        payload: { starts_at, ends_at: starts_at },
      } as unknown as StoredSignal,
      startsAt: new Date(starts_at),
      endsAt: new Date(starts_at),
      videoLink: null,
      linkedItems: [],
      isFocus: false,
    });
    render(
      <CalendarView
        meetings={[meeting("m1", new Date(2026, 4, 6, 10, 0).toISOString())]}
        now={now}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /month/i }));
    const monthGrid = screen.getByLabelText("Month grid");
    expect(monthGrid).toBeTruthy();
    expect(within(monthGrid).getByText("m1")).toBeTruthy();
  });
});
