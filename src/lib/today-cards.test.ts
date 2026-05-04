import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/lib/next-up";
import { pickInboxPreview, pickTodaySchedule } from "#/lib/today-cards";

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
