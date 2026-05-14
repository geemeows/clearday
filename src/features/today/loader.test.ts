import { describe, expect, it } from "vitest";
import { composeTodayViewModel } from "#/features/today/loader";
import type { StoredSignal } from "#/shared/signal";
import type { BriefingCacheEntry } from "#/features/briefing/morning-briefing";

const DEFAULTS = {
  url: null,
  payload: {},
  requires_action: false,
  unread_count: 0,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
  dismissed_at: null,
} as const;

function meeting(id: string, startsAt: string, endsAt?: string): StoredSignal {
  return {
    ...DEFAULTS,
    id,
    provider: "google",
    kind: "meeting",
    source_id: id,
    title: `Meeting ${id}`,
    source_created_at: startsAt,
    payload: {
      starts_at: startsAt,
      ends_at:
        endsAt ??
        new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
      video_link: null,
      linked_items: [],
    },
  };
}

function pr(id: string, createdAt: string, requiresAction = true): StoredSignal {
  return {
    ...DEFAULTS,
    id,
    provider: "github",
    kind: "pr_review_requested",
    source_id: id,
    title: `PR ${id}`,
    source_created_at: createdAt,
    requires_action: requiresAction,
    payload: { repo: "acme/web", number: Number(id.replace(/\D/g, "")) || 1 },
  };
}

function ticket(id: string, createdAt: string): StoredSignal {
  return {
    ...DEFAULTS,
    id,
    provider: "linear",
    kind: "ticket_in_progress",
    source_id: id,
    title: `Ticket ${id}`,
    source_created_at: createdAt,
    requires_action: true,
  };
}

const NOW = new Date("2026-05-04T12:00:00.000Z");

describe("composeTodayViewModel", () => {
  it("returns null nextUp when there are no meetings", () => {
    const vm = composeTodayViewModel([], null, NOW);
    expect(vm.nextUp).toBeNull();
  });

  it("picks the soonest upcoming meeting as nextUp", () => {
    const sigs: StoredSignal[] = [
      meeting("later", "2026-05-04T15:00:00.000Z"),
      meeting("soon", "2026-05-04T12:30:00.000Z"),
    ];
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.nextUp?.title).toBe("Meeting soon");
    expect(vm.nextUp?.when).toBe("2026-05-04T12:30:00.000Z");
  });

  it("builds schedule from today's meeting signals in start-time order", () => {
    const sigs: StoredSignal[] = [
      meeting("b", "2026-05-04T14:00:00.000Z"),
      meeting("a", "2026-05-04T09:00:00.000Z"),
      meeting("yest", "2026-05-03T09:00:00.000Z"),
    ];
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.schedule.map((s) => s.title)).toEqual([
      "Meeting a",
      "Meeting b",
    ]);
    expect(vm.schedule[0].t).toBe("09:00");
    expect(vm.schedule[0].kind).toBe("meeting");
  });

  it("returns empty schedule when all meetings are outside today", () => {
    const sigs = [meeting("yest", "2026-05-03T09:00:00.000Z")];
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.schedule).toEqual([]);
  });

  it("builds inboxPreview capped at 6, requires_action first", () => {
    const sigs: StoredSignal[] = Array.from({ length: 8 }, (_, i) =>
      pr(`pr${i}`, `2026-05-04T${String(i).padStart(2, "0")}:00:00.000Z`, i < 2),
    );
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.inboxPreview).toHaveLength(6);
    // First two are requires_action=true
    expect(vm.inboxPreview[0].unread).toBe(1);
    expect(vm.inboxPreview[1].unread).toBe(1);
  });

  it("maps github provider to 'git' source in preview signals", () => {
    const sigs = [pr("p1", "2026-05-04T09:00:00.000Z")];
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.inboxPreview[0].source).toBe("git");
  });

  it("includes inProgress tickets", () => {
    const sigs: StoredSignal[] = [
      ticket("T-1", "2026-05-04T09:00:00.000Z"),
      ticket("T-2", "2026-05-03T09:00:00.000Z"),
    ];
    const vm = composeTodayViewModel(sigs, null, NOW);
    expect(vm.inProgress).toHaveLength(2);
    expect(vm.inProgress[0].id).toBe("T-1");
  });

  it("returns zero weekStats for empty signals", () => {
    const vm = composeTodayViewModel([], null, NOW);
    expect(vm.weekStats.prs_reviewed).toBe(0);
    expect(vm.weekStats.tickets_shipped).toBe(0);
    expect(vm.weekStats.focus_hours).toBe(0);
    expect(vm.weekStats.inbox_zero_days).toBe(0);
  });

  it("returns null briefing and hasAiConnected=false when no briefing entry", () => {
    const vm = composeTodayViewModel([], null, NOW);
    expect(vm.briefing).toBeNull();
    expect(vm.hasAiConnected).toBe(false);
  });

  it("maps briefing entry to BriefingData and sets hasAiConnected=true", () => {
    const entry: BriefingCacheEntry = {
      date: "2026-05-04",
      text: "Three things stand out this morning.",
      provider: "anthropic",
      model: "claude-haiku-4-5",
      used_fallback: false,
      generated_at: "2026-05-04T07:42:00.000Z",
    };
    const vm = composeTodayViewModel([], entry, NOW);
    expect(vm.hasAiConnected).toBe(true);
    expect(vm.briefing).not.toBeNull();
    expect(vm.briefing?.headline).toBe("Three things stand out this morning.");
    expect(vm.briefing?.model).toBe("claude-haiku-4-5");
    expect(vm.briefing?.generatedAt).toBe("07:42");
    expect(vm.briefing?.items).toEqual([]);
  });

  it("builds sourceMix with human-readable labels and CSS vars", () => {
    const vm = composeTodayViewModel([], null, NOW);
    const githubEntry = vm.sourceMix.find((e) => e.k === "GitHub");
    expect(githubEntry).toBeDefined();
    expect(githubEntry?.c).toBe("var(--src-git)");
  });

  it("all-empty returns all zeros and empty collections", () => {
    const vm = composeTodayViewModel([], null, NOW);
    expect(vm.nextUp).toBeNull();
    expect(vm.schedule).toEqual([]);
    expect(vm.inboxPreview).toEqual([]);
    expect(vm.inProgress).toEqual([]);
    expect(vm.reviewLatency).toHaveLength(7);
    expect(vm.shipByDay).toHaveLength(5);
  });
});
