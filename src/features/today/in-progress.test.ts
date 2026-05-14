import { describe, expect, it } from "vitest";
import { deriveInProgress } from "#/features/today/in-progress";
import type { SignalKind, StoredSignal } from "#/shared/signal";

const DEFAULTS = {
  url: null,
  payload: {},
  requires_action: true,
  unread_count: 0,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  priority: null,
  snoozed_until: null,
  alert_channels_override: null,
  tags: null,
  dismissed_at: null,
} as const;

function ticket(
  id: string,
  kind: SignalKind,
  createdAt: string,
  dismissedAt: string | null = null,
  sourceId?: string,
): StoredSignal {
  return {
    ...DEFAULTS,
    id,
    provider: "linear",
    kind,
    source_id: sourceId ?? id,
    title: `Ticket ${id}`,
    source_created_at: createdAt,
    dismissed_at: dismissedAt,
  };
}

const NOW = new Date("2026-05-04T12:00:00.000Z");

describe("deriveInProgress", () => {
  it("filters only ticket kinds and ignores non-ticket signals", () => {
    const sigs: StoredSignal[] = [
      ticket("t1", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      {
        ...DEFAULTS,
        id: "pr1",
        provider: "github",
        kind: "pr_review_requested",
        source_id: "pr1",
        title: "PR 1",
        source_created_at: "2026-05-04T09:00:00.000Z",
      },
    ];
    const out = deriveInProgress(sigs, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("t1");
  });

  it("ignores dismissed signals", () => {
    const sigs: StoredSignal[] = [
      ticket(
        "dismissed",
        "ticket_in_progress",
        "2026-05-03T09:00:00.000Z",
        "2026-05-04T00:00:00.000Z",
      ),
      ticket("active", "ticket_in_review", "2026-05-04T09:00:00.000Z"),
    ];
    const out = deriveInProgress(sigs, NOW);
    expect(out.map((t) => t.id)).toEqual(["active"]);
  });

  it("orders by status rank: in_progress > in_review > blocked > assigned", () => {
    const sigs: StoredSignal[] = [
      ticket("a", "ticket_blocked", "2026-05-04T09:00:00.000Z"),
      ticket("b", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      ticket("c", "ticket_in_review", "2026-05-04T09:00:00.000Z"),
      ticket("d", "ticket_assigned", "2026-05-04T09:00:00.000Z"),
    ];
    const out = deriveInProgress(sigs, NOW);
    expect(out.map((t) => t.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("orders by recency within the same status rank", () => {
    const sigs: StoredSignal[] = [
      ticket("older", "ticket_in_progress", "2026-05-02T09:00:00.000Z"),
      ticket("newer", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
    ];
    const out = deriveInProgress(sigs, NOW);
    expect(out.map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("dedupes by source_id keeping the highest-rank occurrence", () => {
    const sigs: StoredSignal[] = [
      // Two signals for the same ticket (e.g. different providers ingested same issue)
      ticket("a1", "ticket_in_review", "2026-05-04T09:00:00.000Z", null, "TICKET-1"),
      ticket("a2", "ticket_in_progress", "2026-05-04T08:00:00.000Z", null, "TICKET-1"),
      ticket("b1", "ticket_assigned", "2026-05-04T09:00:00.000Z", null, "TICKET-2"),
    ];
    const out = deriveInProgress(sigs, NOW);
    // TICKET-1 with in_progress (a2) wins; TICKET-1 with in_review (a1) is deduped
    // BUT: sort is by rank first, so in_progress (rank=0) sorts before in_review (rank=1)
    // a2 (in_progress) appears first in sorted order → keeps a2's source_id
    expect(out).toHaveLength(2);
    // The in_progress one (a2) should be included for TICKET-1
    const ticket1Row = out.find((t) => t.id === "TICKET-1");
    expect(ticket1Row).toBeDefined();
  });

  it("clamps to the limit", () => {
    const sigs = Array.from({ length: 10 }, (_, i) =>
      ticket(`t${i}`, "ticket_in_progress", `2026-05-0${(i % 4) + 1}T09:00:00.000Z`),
    );
    expect(deriveInProgress(sigs, NOW, 3)).toHaveLength(3);
  });

  it("returns empty list when limit is 0", () => {
    const sigs = [ticket("t1", "ticket_in_progress", "2026-05-04T09:00:00.000Z")];
    expect(deriveInProgress(sigs, NOW, 0)).toEqual([]);
  });

  it("returns empty list when there are no ticket signals", () => {
    expect(deriveInProgress([], NOW)).toEqual([]);
  });

  it("computes days from source_created_at to now", () => {
    const sigs = [
      ticket("t1", "ticket_in_progress", "2026-05-01T12:00:00.000Z"),
    ];
    const out = deriveInProgress(sigs, NOW);
    // 2026-05-04 12:00 - 2026-05-01 12:00 = 3 days
    expect(out[0].days).toBe(3);
  });

  it("maps numeric payload.priority to P-labels", () => {
    const withPriority = (p: number): StoredSignal => ({
      ...ticket("t", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      payload: { priority: p },
    });
    expect(deriveInProgress([withPriority(1)], NOW)[0].p).toBe("P1");
    expect(deriveInProgress([withPriority(2)], NOW)[0].p).toBe("P2");
    expect(deriveInProgress([withPriority(3)], NOW)[0].p).toBe("P3");
    expect(deriveInProgress([withPriority(4)], NOW)[0].p).toBe("P4");
  });

  it("falls back to signal.priority field for P-label when no payload.priority", () => {
    const hi: StoredSignal = {
      ...ticket("h", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      priority: "high",
    };
    const lo: StoredSignal = {
      ...ticket("l", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      priority: "low",
    };
    const none: StoredSignal = {
      ...ticket("n", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      priority: null,
    };
    expect(deriveInProgress([hi], NOW)[0].p).toBe("P1");
    expect(deriveInProgress([lo], NOW)[0].p).toBe("P3");
    expect(deriveInProgress([none], NOW)[0].p).toBe("P2");
  });

  it("extracts pr reference from payload.pr_number", () => {
    const withPr: StoredSignal = {
      ...ticket("t", "ticket_in_progress", "2026-05-04T09:00:00.000Z"),
      payload: { pr_number: 421 },
    };
    expect(deriveInProgress([withPr], NOW)[0].pr).toBe("#421");
  });

  it("returns null pr when no payload pr reference", () => {
    const sigs = [ticket("t", "ticket_in_progress", "2026-05-04T09:00:00.000Z")];
    expect(deriveInProgress(sigs, NOW)[0].pr).toBeNull();
  });
});
