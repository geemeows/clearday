import { describe, expect, it } from "vitest";
import {
  computeWeekStats,
  filterMeetingsToToday,
  pickInboxPreview,
  pickInProgressTickets,
  pickMeetingForAlert,
  pickNextUp,
  pickTodaySchedule,
} from "#/features/signals/views/today";
import type { SignalKind, StoredSignal } from "#/shared/signal";

const STORED_DEFAULTS = {
  unread_count: 0,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
} as const;

const meetingDetail = (args: {
  id: string;
  starts_at: string;
  ends_at?: string;
}): StoredSignal => ({
  id: args.id,
  provider: "google",
  kind: "meeting",
  source_id: args.id,
  title: "Standup",
  url: "https://calendar.google.com/event",
  payload: {
    starts_at: args.starts_at,
    ends_at: args.ends_at,
    video_link: "https://meet.google.com/abc-defg-hij",
    linked_items: [],
  },
  requires_action: false,
  source_created_at: args.starts_at,
  dismissed_at: null,
  ...STORED_DEFAULTS,
});

const meeting = (
  id: string,
  startsAt: string,
  dismissed = false,
): StoredSignal => ({
  id,
  provider: "google",
  kind: "meeting",
  source_id: id,
  title: `Meeting ${id}`,
  url: null,
  payload: {
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString(),
  },
  requires_action: false,
  source_created_at: startsAt,
  dismissed_at: dismissed ? "2026-05-04T00:00:00.000Z" : null,
  ...STORED_DEFAULTS,
});

const pr = (
  id: string,
  createdAt: string,
  requires_action: boolean,
  dismissed = false,
): StoredSignal => ({
  id,
  provider: "github",
  kind: requires_action ? "pr_review_requested" : "pr_authored",
  source_id: id,
  title: `PR ${id}`,
  url: `https://github.com/acme/web/pull/${id}`,
  payload: { repo: "acme/web", number: Number(id) },
  requires_action,
  source_created_at: createdAt,
  dismissed_at: dismissed ? "2026-05-04T00:00:00.000Z" : null,
  ...STORED_DEFAULTS,
});

describe("pickNextUp", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");

  it("selects the soonest upcoming meeting", () => {
    const sigs: StoredSignal[] = [
      meetingDetail({
        id: "later",
        starts_at: "2026-05-04T15:00:00.000Z",
        ends_at: "2026-05-04T15:30:00.000Z",
      }),
      meetingDetail({
        id: "soon",
        starts_at: "2026-05-04T12:30:00.000Z",
        ends_at: "2026-05-04T13:00:00.000Z",
      }),
    ];
    const result = pickNextUp(sigs, now);
    expect(result?.signal.id).toBe("soon");
    expect(result?.videoLink).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("skips meetings that have already ended", () => {
    const sigs: StoredSignal[] = [
      meetingDetail({
        id: "past",
        starts_at: "2026-05-04T10:00:00.000Z",
        ends_at: "2026-05-04T10:30:00.000Z",
      }),
      meetingDetail({
        id: "future",
        starts_at: "2026-05-04T13:00:00.000Z",
        ends_at: "2026-05-04T13:30:00.000Z",
      }),
    ];
    expect(pickNextUp(sigs, now)?.signal.id).toBe("future");
  });

  it("skips dismissed meetings", () => {
    const sigs: StoredSignal[] = [
      {
        ...meetingDetail({ id: "soon", starts_at: "2026-05-04T12:30:00.000Z" }),
        dismissed_at: "2026-05-04T12:00:00.000Z",
      },
      meetingDetail({ id: "later", starts_at: "2026-05-04T15:00:00.000Z" }),
    ];
    expect(pickNextUp(sigs, now)?.signal.id).toBe("later");
  });

  it("returns null when there are no eligible meetings", () => {
    const sigs: StoredSignal[] = [
      {
        ...meetingDetail({ id: "x", starts_at: "2026-05-04T12:30:00.000Z" }),
        kind: "pr_authored",
      },
    ];
    expect(pickNextUp(sigs, now)).toBeNull();
  });
});

describe("pickMeetingForAlert", () => {
  it("fires for a meeting starting in ~10 minutes", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const sig = meetingDetail({
      id: "m",
      starts_at: "2026-05-04T12:10:00.000Z",
    });
    expect(pickMeetingForAlert([sig], now)?.id).toBe("m");
  });

  it("fires anywhere in the [9min, 11min] window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const earlyEdge = meetingDetail({
      id: "e",
      starts_at: "2026-05-04T12:09:00.000Z",
    });
    const lateEdge = meetingDetail({
      id: "l",
      starts_at: "2026-05-04T12:11:00.000Z",
    });
    expect(pickMeetingForAlert([earlyEdge], now)?.id).toBe("e");
    expect(pickMeetingForAlert([lateEdge], now)?.id).toBe("l");
  });

  it("does not fire outside the window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const tooEarly = meetingDetail({
      id: "x",
      starts_at: "2026-05-04T12:08:30.000Z",
    });
    const tooLate = meetingDetail({
      id: "y",
      starts_at: "2026-05-04T12:12:00.000Z",
    });
    expect(pickMeetingForAlert([tooEarly], now)).toBeNull();
    expect(pickMeetingForAlert([tooLate], now)).toBeNull();
  });

  it("does not fire for dismissed meetings", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const sig = {
      ...meetingDetail({ id: "m", starts_at: "2026-05-04T12:10:00.000Z" }),
      dismissed_at: "2026-05-04T11:55:00.000Z",
    };
    expect(pickMeetingForAlert([sig], now)).toBeNull();
  });
});

describe("pickTodaySchedule", () => {
  it("returns today's meetings in start-time order, drops yesterday/tomorrow", () => {
    const now = new Date("2026-05-04T15:00:00.000Z");
    const today = pickTodaySchedule(
      [
        meeting("late", "2026-05-04T17:00:00.000Z"),
        meeting("yest", "2026-05-03T15:00:00.000Z"),
        meeting("early", "2026-05-04T09:00:00.000Z"),
        meeting("tom", "2026-05-05T09:00:00.000Z"),
      ],
      now,
    );
    expect(today.map((e) => e.signal.id)).toEqual(["early", "late"]);
  });

  it("drops dismissed and non-meeting signals", () => {
    const now = new Date("2026-05-04T15:00:00.000Z");
    const today = pickTodaySchedule(
      [
        meeting("kept", "2026-05-04T09:00:00.000Z"),
        meeting("dropped", "2026-05-04T10:00:00.000Z", true),
        pr("p1", "2026-05-04T11:00:00.000Z", true),
      ],
      now,
    );
    expect(today.map((e) => e.signal.id)).toEqual(["kept"]);
  });

  it("returns an empty list when nothing matches today", () => {
    const now = new Date("2026-05-04T15:00:00.000Z");
    expect(pickTodaySchedule([], now)).toEqual([]);
  });
});

describe("pickInboxPreview", () => {
  it("orders requires_action first, then most-recent, and caps at limit", () => {
    const out = pickInboxPreview(
      [
        pr("1", "2026-05-04T08:00:00.000Z", false),
        pr("2", "2026-05-04T10:00:00.000Z", true),
        pr("3", "2026-05-04T09:00:00.000Z", true),
        pr("4", "2026-05-04T11:00:00.000Z", false),
      ],
      3,
    );
    expect(out.map((s) => s.id)).toEqual(["2", "3", "4"]);
  });

  it("drops dismissed signals", () => {
    const out = pickInboxPreview(
      [
        pr("1", "2026-05-04T11:00:00.000Z", true, true),
        pr("2", "2026-05-04T09:00:00.000Z", true),
      ],
      5,
    );
    expect(out.map((s) => s.id)).toEqual(["2"]);
  });

  it("returns an empty list for a 0 or negative limit", () => {
    expect(
      pickInboxPreview([pr("1", "2026-05-04T09:00:00.000Z", true)], 0),
    ).toEqual([]);
    expect(
      pickInboxPreview([pr("1", "2026-05-04T09:00:00.000Z", true)], -3),
    ).toEqual([]);
  });
});

const ticket = (
  id: string,
  kind: SignalKind,
  createdAt: string,
  dismissedAt: string | null = null,
): StoredSignal => ({
  id,
  provider: "linear",
  kind,
  source_id: id,
  title: `Ticket ${id}`,
  url: `https://linear.app/x/issue/${id}`,
  payload: {},
  requires_action: kind !== "ticket_in_progress",
  source_created_at: createdAt,
  dismissed_at: dismissedAt,
  ...STORED_DEFAULTS,
});

describe("pickInProgressTickets", () => {
  it("orders by status (in_progress > in_review > blocked > assigned), then recency", () => {
    const out = pickInProgressTickets([
      ticket("a", "ticket_blocked", "2026-05-04T09:00:00.000Z"),
      ticket("b", "ticket_in_progress", "2026-05-03T09:00:00.000Z"),
      ticket("c", "ticket_in_review", "2026-05-04T09:00:00.000Z"),
      ticket("d", "ticket_assigned", "2026-05-04T09:00:00.000Z"),
      ticket("e", "ticket_in_progress", "2026-05-04T10:00:00.000Z"),
    ]);
    expect(out.map((s) => s.id)).toEqual(["e", "b", "c", "a", "d"]);
  });

  it("drops dismissed and non-ticket signals; clamps via limit", () => {
    const out = pickInProgressTickets(
      [
        ticket("a", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
        ticket(
          "b",
          "ticket_in_progress",
          "2026-05-03T09:00:00.000Z",
          "2026-05-04T00:00:00.000Z",
        ),
        pr("p", "2026-05-04T09:00:00.000Z", true),
      ],
      1,
    );
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("computeWeekStats", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");
  const inWindow = "2026-05-02T09:00:00.000Z"; // 2d ago
  const outOfWindow = "2026-04-20T09:00:00.000Z"; // 14d ago

  it("counts pr_review_requested signals dismissed-or-acted in window", () => {
    const review = (
      id: string,
      createdAt: string,
      requires_action: boolean,
      dismissed_at: string | null = null,
    ): StoredSignal => ({
      id,
      provider: "github",
      kind: "pr_review_requested",
      source_id: id,
      title: `PR ${id}`,
      url: null,
      payload: {},
      requires_action,
      source_created_at: createdAt,
      dismissed_at,
      ...STORED_DEFAULTS,
    });
    const out = computeWeekStats(
      [
        // acted (requires_action=false) + in window → counts
        review("1", inWindow, false),
        // dismissed in window → counts
        review("2", inWindow, true, inWindow),
        // requires_action true and not dismissed → doesn't count
        review("3", inWindow, true),
        // out of window → doesn't count
        review("4", outOfWindow, false),
      ],
      now,
    );
    expect(out.prsReviewed).toBe(2);
  });

  it("counts ticket_* signals dismissed in window as shipped", () => {
    const out = computeWeekStats(
      [
        ticket("a", "ticket_in_progress", outOfWindow, inWindow),
        ticket("b", "ticket_assigned", outOfWindow, outOfWindow),
        ticket("c", "ticket_in_review", inWindow, null), // not shipped
      ],
      now,
    );
    expect(out.ticketsShipped).toBe(1);
  });

  it("sums focus-meeting durations (hours, 1dp) for in-window starts", () => {
    const focus = (
      id: string,
      startsAt: string,
      endsAt: string,
      isFocus: boolean,
    ): StoredSignal => ({
      id,
      provider: "google",
      kind: "meeting",
      source_id: id,
      title: `f${id}`,
      url: null,
      payload: {
        starts_at: startsAt,
        ends_at: endsAt,
        ...(isFocus ? { is_focus: true } : {}),
      },
      requires_action: false,
      source_created_at: startsAt,
      dismissed_at: null,
      ...STORED_DEFAULTS,
    });
    const out = computeWeekStats(
      [
        // 90-minute focus block in window → 1.5h
        focus("1", inWindow, "2026-05-02T10:30:00.000Z", true),
        // 1-hour focus block in window → 1.0h (total 2.5h)
        focus(
          "2",
          "2026-05-03T08:00:00.000Z",
          "2026-05-03T09:00:00.000Z",
          true,
        ),
        // out-of-window focus block → ignored
        focus("3", outOfWindow, "2026-04-20T10:00:00.000Z", true),
        // non-focus meeting → ignored for focus hours but counted in meetings
        focus("4", inWindow, "2026-05-02T10:00:00.000Z", false),
      ],
      now,
    );
    expect(out.focusHours).toBe(2.5);
  });

  it("counts inbox-zeroed days from actionable signals received and dismissed by end-of-day", () => {
    const actionable = (
      id: string,
      createdAt: string,
      dismissedAt: string | null,
    ): StoredSignal => ({
      id,
      provider: "github",
      kind: "pr_review_requested",
      source_id: id,
      title: `PR ${id}`,
      url: null,
      payload: {},
      requires_action: true,
      source_created_at: createdAt,
      dismissed_at: dismissedAt,
      ...STORED_DEFAULTS,
    });
    // now = 2026-05-04T12:00 UTC; completed days evaluated: 2026-05-03 .. 2026-04-27.
    const out = computeWeekStats(
      [
        // Received + dismissed same day → 2026-05-03 zeroed.
        actionable("a", "2026-05-03T08:00:00.000Z", "2026-05-03T20:00:00.000Z"),
        // Received + dismissed same day → 2026-05-02 zeroed.
        actionable("b", "2026-05-02T08:00:00.000Z", "2026-05-02T18:00:00.000Z"),
        // Received but not dismissed → 2026-05-01 NOT zeroed (carry-over also taints later days).
        actionable("c", "2026-05-01T08:00:00.000Z", null),
      ],
      now,
    );
    // 'c' is unhandled and present from 2026-05-01 onward, so days 05-01..05-03
    // are tainted by carry-over. 2026-04-30..2026-04-27 had no actionable
    // signals received, so they don't count either. Net = 0.
    expect(out.inboxZeroedDays).toBe(0);
  });

  it("counts a day as zeroed when all actionable signals received that day are dismissed and nothing carries over", () => {
    const actionable = (
      id: string,
      createdAt: string,
      dismissedAt: string | null,
    ): StoredSignal => ({
      id,
      provider: "github",
      kind: "pr_review_requested",
      source_id: id,
      title: `PR ${id}`,
      url: null,
      payload: {},
      requires_action: true,
      source_created_at: createdAt,
      dismissed_at: dismissedAt,
      ...STORED_DEFAULTS,
    });
    const out = computeWeekStats(
      [actionable("a", "2026-05-03T08:00:00.000Z", "2026-05-03T20:00:00.000Z")],
      now,
    );
    // 2026-05-03 received+dismissed → zeroed (count=1). Other days had no
    // received signals, so they don't count.
    expect(out.inboxZeroedDays).toBe(1);
  });

  it("returns zeros for an empty list", () => {
    const out = computeWeekStats([], now);
    expect(out.prsReviewed).toBe(0);
    expect(out.ticketsShipped).toBe(0);
    expect(out.focusHours).toBe(0);
    expect(out.inboxZeroedDays).toBe(0);
    expect(out.sourceMix.map((e) => e.count)).toEqual([0, 0, 0, 0, 0]);
    expect(out.reviewLatencyHours).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(out.latencyDeltaHours).toBe(0);
    expect(out.shippedByDay).toHaveLength(5);
    expect(out.shippedByDay.every((d) => d.prs === 0 && d.tickets === 0)).toBe(
      true,
    );
  });

  it("groups in-window signals by source for sourceMix", () => {
    const slack = (id: string, createdAt: string): StoredSignal => ({
      id,
      provider: "slack",
      kind: "mention",
      source_id: id,
      title: id,
      url: null,
      payload: {},
      requires_action: true,
      source_created_at: createdAt,
      dismissed_at: null,
      ...STORED_DEFAULTS,
    });
    const cal = (id: string, startsAt: string): StoredSignal => ({
      id,
      provider: "google",
      kind: "meeting",
      source_id: id,
      title: id,
      url: null,
      payload: { starts_at: startsAt },
      requires_action: false,
      source_created_at: startsAt,
      dismissed_at: null,
      ...STORED_DEFAULTS,
    });
    const out = computeWeekStats(
      [
        pr("p1", inWindow, true),
        pr("p2", inWindow, true),
        slack("s1", inWindow),
        cal("c1", inWindow),
        ticket("t1", "ticket_in_progress", inWindow, null),
        // out of window — not counted
        pr("p3", outOfWindow, true),
      ],
      now,
    );
    const byKey = Object.fromEntries(
      out.sourceMix.map((e) => [e.source, e.count]),
    );
    expect(byKey).toEqual({
      github: 2,
      slack: 1,
      calendar: 1,
      linear: 1,
      ai: 0,
    });
  });

  it("computes 7 daily medians of review latency in hours", () => {
    const review = (
      id: string,
      created: string,
      dismissed: string,
    ): StoredSignal => ({
      id,
      provider: "github",
      kind: "pr_review_requested",
      source_id: id,
      title: id,
      url: null,
      payload: {},
      requires_action: false,
      source_created_at: created,
      dismissed_at: dismissed,
      ...STORED_DEFAULTS,
    });
    // now = 2026-05-04T12:00 UTC. Newest day index = 6 (2026-05-04).
    // Two PRs dismissed on 2026-05-03 with latencies 4h and 6h → median 5h.
    // One PR dismissed on 2026-05-04 with latency 2h.
    const out = computeWeekStats(
      [
        review("a", "2026-05-03T10:00:00.000Z", "2026-05-03T14:00:00.000Z"),
        review("b", "2026-05-03T08:00:00.000Z", "2026-05-03T14:00:00.000Z"),
        review("c", "2026-05-04T08:00:00.000Z", "2026-05-04T10:00:00.000Z"),
      ],
      now,
    );
    expect(out.reviewLatencyHours).toHaveLength(7);
    expect(out.reviewLatencyHours[5]).toBe(5);
    expect(out.reviewLatencyHours[6]).toBe(2);
    // empty days → 0
    expect(out.reviewLatencyHours[0]).toBe(0);
  });

  it("counts shipped PRs and tickets per weekday for the last 5 weekdays", () => {
    // now = Mon 2026-05-04. Last 5 weekdays = Tue..Fri prev week + Mon today.
    const out = computeWeekStats(
      [
        // Ticket dismissed 2026-05-04 (Mon) → tickets:1 on last entry
        ticket(
          "t1",
          "ticket_in_progress",
          "2026-04-20T09:00:00.000Z",
          "2026-05-04T09:00:00.000Z",
        ),
        // Authored PR dismissed 2026-05-01 (Fri) → prs:1
        {
          id: "p1",
          provider: "github",
          kind: "pr_authored",
          source_id: "p1",
          title: "p1",
          url: null,
          payload: {},
          requires_action: false,
          source_created_at: "2026-04-30T09:00:00.000Z",
          dismissed_at: "2026-05-01T09:00:00.000Z",
          ...STORED_DEFAULTS,
        },
      ],
      now,
    );
    expect(out.shippedByDay).toHaveLength(5);
    expect(out.shippedByDay.map((e) => e.day)).toEqual([
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Mon",
    ]);
    expect(out.shippedByDay[3]).toEqual({ day: "Fri", prs: 1, tickets: 0 });
    expect(out.shippedByDay[4]).toEqual({ day: "Mon", prs: 0, tickets: 1 });
  });
});

describe("filterMeetingsToToday", () => {
  const today = new Date("2026-05-04T12:00:00.000Z");

  it("keeps meetings whose start is today and drops those outside", () => {
    const sigs = [
      meeting("today", "2026-05-04T09:00:00.000Z"),
      meeting("yesterday", "2026-05-03T09:00:00.000Z"),
      meeting("tomorrow", "2026-05-05T09:00:00.000Z"),
    ];
    const out = filterMeetingsToToday(sigs, today);
    expect(out.map((s) => s.id)).toEqual(["today"]);
  });

  it("passes non-meeting signals through unchanged", () => {
    const sigs = [
      meeting("today", "2026-05-04T09:00:00.000Z"),
      pr("p1", "2026-05-03T09:00:00.000Z", true),
    ];
    const out = filterMeetingsToToday(sigs, today);
    expect(out.map((s) => s.id)).toEqual(["today", "p1"]);
  });
});
