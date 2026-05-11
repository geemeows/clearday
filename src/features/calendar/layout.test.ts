import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  layoutLanes,
  mondayCol,
  mondayOf,
  toWeekEvents,
  weekRangeLabel,
  weekStartOf,
} from "#/features/calendar/layout";
import type { MeetingEvent, WeekEvent } from "#/features/calendar/types";
import type { StoredSignal } from "#/shared/signal";

const ev = (
  id: string,
  day: number,
  start: number,
  end: number,
): WeekEvent => ({
  id,
  day,
  start,
  end,
  kind: "meeting",
  title: id,
});

const meetingEvent = (
  id: string,
  startsAt: Date,
  endsAt: Date,
  opts: { isFocus?: boolean; title?: string } = {},
): MeetingEvent => ({
  signal: {
    id,
    provider: "google",
    kind: "meeting",
    source_id: id,
    title: opts.title ?? id,
    url: null,
    payload: {},
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
  } satisfies StoredSignal,
  startsAt,
  endsAt,
  videoLink: null,
  linkedItems: [],
  isFocus: opts.isFocus ?? false,
});

describe("mondayOf", () => {
  it("returns Monday 00:00 for a Wednesday", () => {
    const wed = new Date(2026, 4, 6, 14, 30); // Wed May 6 2026
    const monday = mondayOf(wed);
    expect(monday.getDay()).toBe(1);
    expect(monday.getHours()).toBe(0);
    expect(monday.getDate()).toBe(4);
  });

  it("returns the same day when given a Monday", () => {
    const mon = new Date(2026, 4, 4, 9, 0);
    expect(mondayOf(mon).getDate()).toBe(4);
  });

  it("rolls back across a month boundary on a Sunday", () => {
    const sun = new Date(2026, 4, 3, 12, 0); // Sun May 3
    const monday = mondayOf(sun);
    expect(monday.getMonth()).toBe(3); // April
    expect(monday.getDate()).toBe(27);
    expect(monday.getDay()).toBe(1);
  });
});

describe("weekStartOf", () => {
  // Wed May 6 2026 sits between Sun May 3, Mon May 4, and the previous Sat May 2.
  const wed = new Date(2026, 4, 6, 14, 30);

  it("'mon' anchors to Monday (matches mondayOf)", () => {
    const got = weekStartOf(wed, "mon");
    expect(got.getDay()).toBe(1);
    expect(got.getDate()).toBe(4);
    expect(got.getHours()).toBe(0);
  });

  it("'sun' anchors to Sunday", () => {
    const got = weekStartOf(wed, "sun");
    expect(got.getDay()).toBe(0);
    expect(got.getDate()).toBe(3);
    expect(got.getHours()).toBe(0);
  });

  it("'sat' anchors to the previous Saturday", () => {
    const got = weekStartOf(wed, "sat");
    expect(got.getDay()).toBe(6);
    expect(got.getDate()).toBe(2);
    expect(got.getHours()).toBe(0);
  });

  it("returns the same day when the anchor day itself is passed", () => {
    const sun = new Date(2026, 4, 3, 12, 0);
    expect(weekStartOf(sun, "sun").getDate()).toBe(3);
    const sat = new Date(2026, 4, 2, 12, 0);
    expect(weekStartOf(sat, "sat").getDate()).toBe(2);
    const mon = new Date(2026, 4, 4, 12, 0);
    expect(weekStartOf(mon, "mon").getDate()).toBe(4);
  });
});

describe("mondayCol", () => {
  it("maps Mon..Fri to 0..4", () => {
    expect(mondayCol(new Date(2026, 4, 4))).toBe(0);
    expect(mondayCol(new Date(2026, 4, 5))).toBe(1);
    expect(mondayCol(new Date(2026, 4, 6))).toBe(2);
    expect(mondayCol(new Date(2026, 4, 7))).toBe(3);
    expect(mondayCol(new Date(2026, 4, 8))).toBe(4);
  });

  it("returns null for the weekend", () => {
    expect(mondayCol(new Date(2026, 4, 9))).toBeNull(); // Sat
    expect(mondayCol(new Date(2026, 4, 10))).toBeNull(); // Sun
  });
});

describe("weekRangeLabel", () => {
  it("spans Monday through Friday of the containing week", () => {
    const wed = new Date(2026, 4, 6, 12, 0);
    expect(weekRangeLabel(wed)).toMatch(/May 4.*–.*May 8/);
  });
});

describe("toWeekEvents", () => {
  it("filters out events outside the Mon–Fri window", () => {
    const monday = mondayOf(new Date(2026, 4, 6));
    const events = [
      meetingEvent(
        "mon",
        new Date(2026, 4, 4, 10, 0),
        new Date(2026, 4, 4, 11, 0),
      ),
      meetingEvent(
        "sat",
        new Date(2026, 4, 9, 10, 0),
        new Date(2026, 4, 9, 11, 0),
      ),
      meetingEvent(
        "prev-week",
        new Date(2026, 3, 30, 10, 0),
        new Date(2026, 3, 30, 11, 0),
      ),
    ];
    const out = toWeekEvents(events, monday);
    expect(out.map((e) => e.id)).toEqual(["mon"]);
    expect(out[0].day).toBe(0);
  });

  it("derives day index 0..4 across Mon..Fri", () => {
    const monday = mondayOf(new Date(2026, 4, 6));
    const events = [
      meetingEvent(
        "mon",
        new Date(2026, 4, 4, 10, 0),
        new Date(2026, 4, 4, 11, 0),
      ),
      meetingEvent(
        "fri",
        new Date(2026, 4, 8, 10, 0),
        new Date(2026, 4, 8, 11, 0),
      ),
    ];
    const out = toWeekEvents(events, monday);
    expect(out.find((e) => e.id === "mon")?.day).toBe(0);
    expect(out.find((e) => e.id === "fri")?.day).toBe(4);
  });

  it("classifies focus blocks and break-titled meetings", () => {
    const monday = mondayOf(new Date(2026, 4, 6));
    const events = [
      meetingEvent(
        "f",
        new Date(2026, 4, 4, 9, 0),
        new Date(2026, 4, 4, 10, 0),
        { isFocus: true },
      ),
      meetingEvent(
        "lunch",
        new Date(2026, 4, 4, 12, 0),
        new Date(2026, 4, 4, 13, 0),
        { title: "Lunch" },
      ),
      meetingEvent(
        "standup",
        new Date(2026, 4, 4, 14, 0),
        new Date(2026, 4, 4, 14, 15),
        { title: "Standup" },
      ),
    ];
    const out = toWeekEvents(events, monday);
    expect(out.find((e) => e.id === "f")?.kind).toBe("focus");
    expect(out.find((e) => e.id === "lunch")?.kind).toBe("break");
    expect(out.find((e) => e.id === "standup")?.kind).toBe("meeting");
  });
});

describe("layoutLanes", () => {
  it("places non-overlapping events all in lane 0", () => {
    const a = ev("a", 0, 540, 600);
    const b = ev("b", 0, 660, 720);
    const lanes = layoutLanes([a, b]);
    expect(lanes.get("a")).toEqual({ col: 0, of: 1 });
    expect(lanes.get("b")).toEqual({ col: 0, of: 1 });
  });

  it("packs two overlapping events into lanes 0 and 1", () => {
    const a = ev("a", 0, 540, 660);
    const b = ev("b", 0, 600, 720);
    const lanes = layoutLanes([a, b]);
    expect(lanes.get("a")).toEqual({ col: 0, of: 2 });
    expect(lanes.get("b")).toEqual({ col: 1, of: 2 });
  });

  it("reuses lane 0 once its previous event has ended", () => {
    const a = ev("a", 0, 540, 600);
    const b = ev("b", 0, 570, 660);
    const c = ev("c", 0, 600, 660); // a ended at 600, c can take lane 0
    const lanes = layoutLanes([a, b, c]);
    expect(lanes.get("a")?.col).toBe(0);
    expect(lanes.get("b")?.col).toBe(1);
    expect(lanes.get("c")?.col).toBe(0);
    // a/b/c are all in the same cluster (b overlaps both), so of === 2
    expect(lanes.get("a")?.of).toBe(2);
    expect(lanes.get("c")?.of).toBe(2);
  });

  it("treats two independent overlap clusters separately", () => {
    const a = ev("a", 0, 540, 660);
    const b = ev("b", 0, 600, 720);
    const c = ev("c", 0, 800, 860);
    const d = ev("d", 0, 820, 880);
    const lanes = layoutLanes([a, b, c, d]);
    expect(lanes.get("a")?.of).toBe(2);
    expect(lanes.get("b")?.of).toBe(2);
    expect(lanes.get("c")?.of).toBe(2);
    expect(lanes.get("d")?.of).toBe(2);
  });
});

describe("detectConflicts", () => {
  it("returns [] when no events overlap", () => {
    const events = [ev("a", 0, 540, 600), ev("b", 0, 660, 720)];
    expect(detectConflicts(events)).toEqual([]);
  });

  it("returns [] for edge-touching events (a.end === b.start)", () => {
    const events = [ev("a", 0, 540, 600), ev("b", 0, 600, 660)];
    expect(detectConflicts(events)).toEqual([]);
  });

  it("returns one pair for a single overlap", () => {
    const a = ev("a", 0, 540, 660);
    const b = ev("b", 0, 600, 720);
    const pairs = detectConflicts([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("a");
    expect(pairs[0].b.id).toBe("b");
  });

  it("returns three pairs for a three-way overlap", () => {
    const a = ev("a", 0, 540, 720);
    const b = ev("b", 0, 600, 780);
    const c = ev("c", 0, 660, 840);
    const pairs = detectConflicts([a, b, c]);
    expect(pairs).toHaveLength(3);
    const ids = pairs.map((p) => `${p.a.id}-${p.b.id}`).sort();
    expect(ids).toEqual(["a-b", "a-c", "b-c"]);
  });

  it("never reports cross-day events as conflicts", () => {
    const events = [
      ev("a", 0, 540, 720),
      ev("b", 1, 540, 720),
      ev("c", 2, 540, 720),
    ];
    expect(detectConflicts(events)).toEqual([]);
  });
});
