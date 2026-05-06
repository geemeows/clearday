import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  pickMeetingForAlert,
  pickNextUp,
} from "#/lib/next-up";
import type { StoredSignal } from "#/shared/signal";

const meeting = (args: {
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
  unread_count: 0,
  created_at: args.starts_at,
  updated_at: args.starts_at,
  dismissed_at: null,
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
});

describe("pickNextUp", () => {
  const now = new Date("2026-05-04T12:00:00.000Z");

  it("selects the soonest upcoming meeting", () => {
    const sigs: StoredSignal[] = [
      meeting({
        id: "later",
        starts_at: "2026-05-04T15:00:00.000Z",
        ends_at: "2026-05-04T15:30:00.000Z",
      }),
      meeting({
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
      meeting({
        id: "past",
        starts_at: "2026-05-04T10:00:00.000Z",
        ends_at: "2026-05-04T10:30:00.000Z",
      }),
      meeting({
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
        ...meeting({ id: "soon", starts_at: "2026-05-04T12:30:00.000Z" }),
        dismissed_at: "2026-05-04T12:00:00.000Z",
      },
      meeting({ id: "later", starts_at: "2026-05-04T15:00:00.000Z" }),
    ];
    expect(pickNextUp(sigs, now)?.signal.id).toBe("later");
  });

  it("returns null when there are no eligible meetings", () => {
    const sigs: StoredSignal[] = [
      {
        ...meeting({ id: "x", starts_at: "2026-05-04T12:30:00.000Z" }),
        kind: "pr_authored",
      },
    ];
    expect(pickNextUp(sigs, now)).toBeNull();
  });
});

describe("pickMeetingForAlert", () => {
  it("fires for a meeting starting in ~10 minutes", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const sig = meeting({ id: "m", starts_at: "2026-05-04T12:10:00.000Z" });
    expect(pickMeetingForAlert([sig], now)?.id).toBe("m");
  });

  it("fires anywhere in the [9min, 11min] window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const earlyEdge = meeting({
      id: "e",
      starts_at: "2026-05-04T12:09:00.000Z",
    });
    const lateEdge = meeting({
      id: "l",
      starts_at: "2026-05-04T12:11:00.000Z",
    });
    expect(pickMeetingForAlert([earlyEdge], now)?.id).toBe("e");
    expect(pickMeetingForAlert([lateEdge], now)?.id).toBe("l");
  });

  it("does not fire outside the window", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const tooEarly = meeting({
      id: "x",
      starts_at: "2026-05-04T12:08:30.000Z",
    });
    const tooLate = meeting({
      id: "y",
      starts_at: "2026-05-04T12:12:00.000Z",
    });
    expect(pickMeetingForAlert([tooEarly], now)).toBeNull();
    expect(pickMeetingForAlert([tooLate], now)).toBeNull();
  });

  it("does not fire for dismissed meetings", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const sig = {
      ...meeting({ id: "m", starts_at: "2026-05-04T12:10:00.000Z" }),
      dismissed_at: "2026-05-04T11:55:00.000Z",
    };
    expect(pickMeetingForAlert([sig], now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("formats minutes only for sub-hour intervals", () => {
    expect(
      formatCountdown(
        new Date("2026-05-04T12:30:00.000Z"),
        new Date("2026-05-04T12:00:00.000Z"),
      ),
    ).toBe("in 30m");
  });

  it("formats hours and minutes for hour-plus intervals", () => {
    expect(
      formatCountdown(
        new Date("2026-05-04T14:30:00.000Z"),
        new Date("2026-05-04T12:00:00.000Z"),
      ),
    ).toBe("in 2h 30m");
  });

  it("returns 'now' for zero-or-past times", () => {
    expect(
      formatCountdown(
        new Date("2026-05-04T12:00:00.000Z"),
        new Date("2026-05-04T12:30:00.000Z"),
      ),
    ).toBe("now");
  });
});
