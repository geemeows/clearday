import { describe, expect, it } from "vitest";
import {
  eventsByMonthGrid,
  eventsByWeekDay,
  eventsForDay,
  findConflicts,
  type MeetingEvent,
  pickActiveFocus,
  pickFocusBlocks,
  pickNextConflict,
  toMeetingEvent,
  toMeetingEvents,
  weekStartFor,
} from "#/features/signals/views/calendar";
import type { StoredSignal } from "#/lib/next-up";

const meeting = (args: {
  id: string;
  starts_at: string;
  ends_at: string;
  title?: string;
  is_focus?: boolean;
  dismissed_at?: string | null;
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
  dismissed_at: args.dismissed_at ?? null,
});

const ev = (id: string, start: string, end: string, title = "Meeting") =>
  toMeetingEvent(
    meeting({ id, starts_at: start, ends_at: end, title }),
  ) as MeetingEvent;

describe("toMeetingEvent", () => {
  it("returns null for non-meeting signals", () => {
    const s = meeting({
      id: "x",
      starts_at: "2026-05-04T12:00:00.000Z",
      ends_at: "2026-05-04T13:00:00.000Z",
    });
    s.kind = "dm";
    expect(toMeetingEvent(s)).toBeNull();
  });

  it("returns null for dismissed signals", () => {
    expect(
      toMeetingEvent(
        meeting({
          id: "x",
          starts_at: "2026-05-04T12:00:00.000Z",
          ends_at: "2026-05-04T13:00:00.000Z",
          dismissed_at: "2026-05-04T12:00:00.000Z",
        }),
      ),
    ).toBeNull();
  });

  it("returns null when starts_at or ends_at missing", () => {
    const bad = meeting({
      id: "x",
      starts_at: "2026-05-04T12:00:00.000Z",
      ends_at: "2026-05-04T13:00:00.000Z",
    });
    bad.payload = { starts_at: bad.payload.starts_at };
    expect(toMeetingEvent(bad)).toBeNull();
  });

  it("flags focus blocks via title or payload", () => {
    const byTitle = ev(
      "a",
      "2026-05-04T12:00:00.000Z",
      "2026-05-04T13:00:00.000Z",
      "Focus block",
    );
    expect(byTitle.isFocus).toBe(true);
    const byPayload = toMeetingEvent(
      meeting({
        id: "b",
        starts_at: "2026-05-04T14:00:00.000Z",
        ends_at: "2026-05-04T15:00:00.000Z",
        is_focus: true,
        title: "Heads down",
      }),
    );
    expect(byPayload?.isFocus).toBe(true);
  });
});

describe("toMeetingEvents", () => {
  it("sorts by start and drops invalid signals", () => {
    const out = toMeetingEvents([
      meeting({
        id: "later",
        starts_at: "2026-05-04T15:00:00.000Z",
        ends_at: "2026-05-04T16:00:00.000Z",
      }),
      meeting({
        id: "early",
        starts_at: "2026-05-04T10:00:00.000Z",
        ends_at: "2026-05-04T11:00:00.000Z",
      }),
    ]);
    expect(out.map((e) => e.signal.id)).toEqual(["early", "later"]);
  });
});

describe("eventsForDay / eventsByWeekDay", () => {
  it("returns events in local-day bounds and groups across the week", () => {
    const events = [
      ev("mon", "2026-05-04T13:00:00.000Z", "2026-05-04T14:00:00.000Z"),
      ev("tue", "2026-05-05T13:00:00.000Z", "2026-05-05T14:00:00.000Z"),
      ev("wed", "2026-05-06T01:00:00.000Z", "2026-05-06T02:00:00.000Z"),
    ];
    const monday = new Date("2026-05-04T00:00:00.000Z");
    expect(eventsForDay(events, monday).map((e) => e.signal.id)).toEqual([
      "mon",
    ]);
    const sunday = weekStartFor(monday);
    const buckets = eventsByWeekDay(events, sunday);
    expect(buckets).toHaveLength(7);
    expect(buckets[1].events.map((e) => e.signal.id)).toEqual(["mon"]);
    expect(buckets[2].events.map((e) => e.signal.id)).toEqual(["tue"]);
    expect(buckets[3].events.map((e) => e.signal.id)).toEqual(["wed"]);
  });
});

describe("eventsByMonthGrid", () => {
  it("returns 42 cells starting on Sunday and flags out-of-month days", () => {
    // May 2026: 1st is Friday. Grid starts Sun Apr 26, ends Sat Jun 6.
    const anchor = new Date(2026, 4, 4);
    const events = [
      ev("a", "2026-05-04T13:00:00.000Z", "2026-05-04T14:00:00.000Z"),
      ev("b", "2026-05-04T15:00:00.000Z", "2026-05-04T15:30:00.000Z"),
      ev("c", "2026-04-28T13:00:00.000Z", "2026-04-28T14:00:00.000Z"),
    ];
    const cells = eventsByMonthGrid(events, anchor);
    expect(cells).toHaveLength(42);
    expect(cells[0].day.getDay()).toBe(0);
    // Sun Apr 26 is out-of-month, May 4 (Mon, cell index 8) is in-month.
    expect(cells[0].inMonth).toBe(false);
    const may4 = cells.find(
      (c) => c.day.toDateString() === anchor.toDateString(),
    );
    expect(may4?.inMonth).toBe(true);
    expect(may4?.events.map((e) => e.signal.id).sort()).toEqual(["a", "b"]);
    const apr28 = cells.find(
      (c) => c.day.toDateString() === new Date(2026, 3, 28).toDateString(),
    );
    expect(apr28?.inMonth).toBe(false);
    expect(apr28?.events.map((e) => e.signal.id)).toEqual(["c"]);
  });
});

describe("findConflicts / pickNextConflict", () => {
  it("returns no conflicts for non-overlapping events", () => {
    expect(
      findConflicts([
        ev("a", "2026-05-04T10:00:00.000Z", "2026-05-04T11:00:00.000Z"),
        ev("b", "2026-05-04T11:00:00.000Z", "2026-05-04T12:00:00.000Z"),
      ]),
    ).toEqual([]);
  });

  it("detects partial overlap", () => {
    const a = ev("a", "2026-05-04T10:00:00.000Z", "2026-05-04T11:00:00.000Z");
    const b = ev("b", "2026-05-04T10:30:00.000Z", "2026-05-04T11:30:00.000Z");
    expect(findConflicts([a, b])).toEqual([{ a, b }]);
  });

  it("detects nested overlap", () => {
    const a = ev("a", "2026-05-04T10:00:00.000Z", "2026-05-04T12:00:00.000Z");
    const b = ev("b", "2026-05-04T10:30:00.000Z", "2026-05-04T11:00:00.000Z");
    expect(findConflicts([a, b])).toEqual([{ a, b }]);
  });

  it("picks the next conflict whose later event hasn't ended yet", () => {
    const past = ev(
      "p",
      "2026-05-04T08:00:00.000Z",
      "2026-05-04T09:00:00.000Z",
    );
    const past2 = ev(
      "p2",
      "2026-05-04T08:30:00.000Z",
      "2026-05-04T09:30:00.000Z",
    );
    const future = ev(
      "f",
      "2026-05-04T13:00:00.000Z",
      "2026-05-04T14:00:00.000Z",
    );
    const future2 = ev(
      "f2",
      "2026-05-04T13:30:00.000Z",
      "2026-05-04T14:30:00.000Z",
    );
    const now = new Date("2026-05-04T10:00:00.000Z");
    const next = pickNextConflict([past, past2, future, future2], now);
    expect(next?.a.signal.id).toBe("f");
    expect(next?.b.signal.id).toBe("f2");
  });
});

describe("pickFocusBlocks", () => {
  it("returns events flagged as focus", () => {
    const a = ev(
      "focus",
      "2026-05-04T13:00:00.000Z",
      "2026-05-04T15:00:00.000Z",
      "Focus block",
    );
    const b = ev(
      "standup",
      "2026-05-04T15:00:00.000Z",
      "2026-05-04T15:15:00.000Z",
      "Standup",
    );
    expect(pickFocusBlocks([a, b])).toEqual([a]);
  });
});

describe("pickActiveFocus", () => {
  it("returns the focus block currently in progress", () => {
    const focus = ev(
      "f",
      "2026-05-04T13:00:00.000Z",
      "2026-05-04T15:00:00.000Z",
      "Focus block",
    );
    const standup = ev(
      "s",
      "2026-05-04T13:30:00.000Z",
      "2026-05-04T13:45:00.000Z",
      "Standup",
    );
    const now = new Date("2026-05-04T13:30:00.000Z");
    expect(pickActiveFocus([focus, standup], now)).toBe(focus);
  });

  it("returns null when no focus block is active", () => {
    const focus = ev(
      "f",
      "2026-05-04T13:00:00.000Z",
      "2026-05-04T15:00:00.000Z",
      "Focus block",
    );
    const after = new Date("2026-05-04T16:00:00.000Z");
    const before = new Date("2026-05-04T12:00:00.000Z");
    expect(pickActiveFocus([focus], after)).toBeNull();
    expect(pickActiveFocus([focus], before)).toBeNull();
  });

  it("ignores non-focus meetings even when in progress", () => {
    const standup = ev(
      "s",
      "2026-05-04T13:00:00.000Z",
      "2026-05-04T13:30:00.000Z",
      "Standup",
    );
    const now = new Date("2026-05-04T13:15:00.000Z");
    expect(pickActiveFocus([standup], now)).toBeNull();
  });
});
