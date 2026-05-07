import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeFilterCounts,
  daysInProgress,
  filterToGroup,
  formatSnoozeReturn,
  groupOf,
  kindGroup,
  prRefOf,
  relAgo,
  secondaryLabel,
  severityOf,
} from "#/features/signals/display";
import type { Signal } from "#/shared/signal";

const signal = (overrides: Partial<Signal> = {}): Signal => ({
  provider: "github",
  kind: "pr_review_requested",
  source_id: "owner/repo#42",
  title: "Add cron orchestrator",
  url: null,
  payload: {},
  requires_action: false,
  source_created_at: null,
  ...overrides,
});

describe("kindGroup / groupOf", () => {
  it("rolls up Slack kinds", () => {
    expect(kindGroup("dm")).toBe("slack");
    expect(kindGroup("mention")).toBe("slack");
    expect(kindGroup("thread_reply")).toBe("slack");
  });
  it("rolls up ticket kinds", () => {
    expect(kindGroup("ticket_assigned")).toBe("ticket");
    expect(kindGroup("ticket_in_progress")).toBe("ticket");
    expect(kindGroup("ticket_in_review")).toBe("ticket");
    expect(kindGroup("ticket_blocked")).toBe("ticket");
  });
  it("rolls up meeting", () => {
    expect(kindGroup("meeting")).toBe("meeting");
  });
  it("falls back to pr for PR kinds", () => {
    expect(kindGroup("pr_review_requested")).toBe("pr");
    expect(kindGroup("pr_authored")).toBe("pr");
    expect(kindGroup("pr_assigned")).toBe("pr");
  });
  it("groupOf delegates to kindGroup via signal.kind", () => {
    expect(groupOf(signal({ kind: "mention" }))).toBe("slack");
    expect(groupOf(signal({ kind: "meeting" }))).toBe("meeting");
  });
});

describe("filterToGroup", () => {
  it("maps each filter to its group", () => {
    expect(filterToGroup("prs")).toBe("pr");
    expect(filterToGroup("tickets")).toBe("ticket");
    expect(filterToGroup("mentions")).toBe("slack");
    expect(filterToGroup("meetings")).toBe("meeting");
  });
  it("returns null for 'all'", () => {
    expect(filterToGroup("all")).toBeNull();
  });
});

describe("computeFilterCounts", () => {
  it("counts signals by group", () => {
    const counts = computeFilterCounts([
      signal({ kind: "pr_review_requested" }),
      signal({ kind: "pr_authored" }),
      signal({ kind: "mention" }),
      signal({ kind: "meeting" }),
      signal({ kind: "ticket_assigned" }),
    ]);
    expect(counts.all).toBe(5);
    expect(counts.prs).toBe(2);
    expect(counts.mentions).toBe(1);
    expect(counts.meetings).toBe(1);
    expect(counts.tickets).toBe(1);
  });
});

describe("severityOf", () => {
  it("returns explicit severity", () => {
    expect(severityOf(signal({ payload: { severity: "ci_fail" } }))).toBe(
      "ci_fail",
    );
    expect(severityOf(signal({ payload: { severity: "conflict" } }))).toBe(
      "conflict",
    );
  });
  it("falls back to ci_failed / has_conflict booleans", () => {
    expect(severityOf(signal({ payload: { ci_failed: true } }))).toBe(
      "ci_fail",
    );
    expect(severityOf(signal({ payload: { has_conflict: true } }))).toBe(
      "conflict",
    );
  });
  it("returns null when no severity hints present", () => {
    expect(severityOf(signal())).toBeNull();
  });
});

describe("secondaryLabel", () => {
  it("formats Slack DM with author name", () => {
    expect(
      secondaryLabel(
        signal({
          provider: "slack",
          kind: "dm",
          payload: { channel_type: "im", author_name: "Alice" },
        }),
      ),
    ).toBe("DM · from Alice");
  });
  it("formats Slack mention with channel name and author id", () => {
    expect(
      secondaryLabel(
        signal({
          provider: "slack",
          kind: "mention",
          payload: { channel_name: "general", author: "U123" },
        }),
      ),
    ).toBe("#general · from <@U123>");
  });
  it("formats ticket with identifier and state", () => {
    expect(
      secondaryLabel(
        signal({
          provider: "linear",
          kind: "ticket_assigned",
          payload: { identifier: "ENG-123", state_name: "In Progress" },
        }),
      ),
    ).toBe("ENG-123 · In Progress");
  });
  it("formats PR with repo / number / author / diff", () => {
    expect(
      secondaryLabel(
        signal({
          payload: {
            repo: "owner/repo",
            number: 42,
            author: "alice",
            additions: 12,
            deletions: 3,
          },
        }),
      ),
    ).toBe("owner/repo #42 · alice · +12 −3");
  });
});

describe("relAgo", () => {
  const now = "2026-05-06T12:00:00.000Z";
  it("returns minutes for sub-hour gaps", () => {
    expect(relAgo("2026-05-06T11:55:00.000Z", now)).toBe("5m ago");
  });
  it("returns hours for sub-day gaps", () => {
    expect(relAgo("2026-05-06T09:00:00.000Z", now)).toBe("3h ago");
  });
  it("returns days for multi-day gaps", () => {
    expect(relAgo("2026-05-04T12:00:00.000Z", now)).toBe("2d ago");
  });
  it("returns 'in Nm' for future timestamps", () => {
    expect(relAgo("2026-05-06T12:10:00.000Z", now)).toBe("in 10m");
  });
  it("returns empty string when iso is null", () => {
    expect(relAgo(null, now)).toBe("");
  });
});

describe("formatSnoozeReturn", () => {
  it("returns empty string for null / undefined", () => {
    expect(formatSnoozeReturn(null)).toBe("");
    expect(formatSnoozeReturn(undefined)).toBe("");
  });
  it("returns the original string for unparseable input", () => {
    expect(formatSnoozeReturn("not-a-date")).toBe("not-a-date");
  });
  it("renders a parseable iso", () => {
    expect(formatSnoozeReturn("2026-05-06T12:00:00.000Z")).not.toBe("");
  });
});

describe("prRefOf", () => {
  it("uses payload.pr_number first", () => {
    expect(prRefOf(signal({ payload: { pr_number: 7, number: 99 } }))).toBe(
      "#7",
    );
  });
  it("falls back to payload.number", () => {
    expect(prRefOf(signal({ payload: { number: 99 } }))).toBe("#99");
  });
  it("returns null when missing", () => {
    expect(prRefOf(signal())).toBeNull();
  });
});

describe("daysInProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("returns whole-day delta from source_created_at", () => {
    expect(
      daysInProgress(signal({ source_created_at: "2026-05-07T00:00:00.000Z" })),
    ).toBe(3);
  });
  it("clamps negative deltas to 0", () => {
    expect(
      daysInProgress(signal({ source_created_at: "2026-05-12T00:00:00.000Z" })),
    ).toBe(0);
  });
  it("returns null when no source_created_at", () => {
    expect(daysInProgress(signal())).toBeNull();
  });
});
