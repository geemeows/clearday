import { describe, expect, it, vi } from "vitest";
import {
  type AutomationRunInsert,
  type AutomationRunsStore,
  executeAutomation,
  inMemoryRateLimiter,
  type RateLimiter,
} from "#/features/automations/executor";

function memoryRunsStore(): AutomationRunsStore & {
  rows: AutomationRunInsert[];
} {
  const rows: AutomationRunInsert[] = [];
  return {
    rows,
    insertIfNew: async (row) => {
      const dup = rows.find(
        (r) =>
          r.automation_id === row.automation_id &&
          r.trigger_event_id === row.trigger_event_id,
      );
      if (dup) return false;
      rows.push(row);
      return true;
    },
  };
}

describe("executeAutomation", () => {
  it("records a succeeded run for a clean dispatch", async () => {
    const store = memoryRunsStore();
    const result = await executeAutomation(
      {
        plan: { automation_id: "a-1", actions: [{ type: "tag", tag: "x" }] },
        triggerEventId: "sig-1:2026-05-04T10:00:00.000Z",
        signalId: "sig-1",
      },
      store,
    );
    expect(result.status).toBe("succeeded");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe("succeeded");
    expect(store.rows[0].actions_executed.map((a) => a.type)).toEqual(["tag"]);
  });

  it("short-circuits to skipped_idempotent on duplicate (automation, trigger_event_id)", async () => {
    const store = memoryRunsStore();
    const input = {
      plan: {
        automation_id: "a-1",
        actions: [{ type: "tag" as const, tag: "x" }],
      },
      triggerEventId: "sig-1:2026-05-04T10:00:00.000Z",
      signalId: "sig-1",
    };
    await executeAutomation(input, store);
    const second = await executeAutomation(input, store);
    expect(second.status).toBe("skipped_idempotent");
    expect(store.rows).toHaveLength(1);
  });

  it("records a failed run with the captured error when a handler reports failure", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn(async () => ({
      type: "tag" as const,
      ok: false,
      error: "channel_not_found",
    }));
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:2026-05-04T10:00:00.000Z",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false },
    );
    expect(result.status).toBe("failed");
    expect(result.error).toBe("channel_not_found");
    expect(store.rows[0].status).toBe("failed");
    expect(store.rows[0].error).toBe("channel_not_found");
  });

  it("records a failed run when a handler throws", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:t",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false },
    );
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
  });

  it("dry-run records skipped_dry_run with the planned actions and an empty executed list", async () => {
    const store = memoryRunsStore();
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:t",
        signalId: "sig-1",
      },
      store,
      { dryRun: true },
    );
    expect(result.status).toBe("skipped_dry_run");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].actions_executed).toEqual([]);
    expect(store.rows[0].actions_planned.map((a) => a.type)).toEqual(["tag"]);
  });

  it("records skipped_no_capability for a plan whose only action is transition_ticket", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn();
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "transition_ticket", to_status: "Done" }],
        },
        triggerEventId: "sig-1:t",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false },
    );
    expect(result.status).toBe("skipped_no_capability");
    expect(result.executed).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe("skipped_no_capability");
    expect(store.rows[0].actions_planned).toEqual([
      { type: "transition_ticket", to_status: "Done" },
    ]);
    expect(store.rows[0].actions_executed).toEqual([]);
  });

  it("rate-limit overflow writes a failed run with the limiter's error and skips the handler", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn(async () => ({ type: "tag" as const, ok: true }));
    const limiter = inMemoryRateLimiter({ perMinute: 1 });
    const now = () => new Date("2026-05-04T10:00:00.000Z");
    const first = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:t1",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false, rateLimiter: limiter, now },
    );
    expect(first.status).toBe("succeeded");
    const second = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "y" }],
        },
        triggerEventId: "sig-2:t2",
        signalId: "sig-2",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false, rateLimiter: limiter, now },
    );
    expect(second.status).toBe("failed");
    expect(second.error).toMatch(/rate_limit_exceeded/);
    expect(second.executed).toEqual([]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1].status).toBe("failed");
    expect(store.rows[1].error).toMatch(/rate_limit_exceeded/);
    expect(store.rows[1].actions_executed).toEqual([]);
    expect(store.rows[1].actions_planned).toEqual([{ type: "tag", tag: "y" }]);
  });

  it("rate limiter is not consulted for dry-run dispatches", async () => {
    const store = memoryRunsStore();
    const tryConsume = vi.fn(() => ({ ok: false as const, error: "x" }));
    const limiter: RateLimiter = { tryConsume };
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:t",
        signalId: "sig-1",
      },
      store,
      { dryRun: true, rateLimiter: limiter },
    );
    expect(result.status).toBe("skipped_dry_run");
    expect(tryConsume).not.toHaveBeenCalled();
  });

  it("rate-limit bucket resets across minute boundaries", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn(async () => ({ type: "tag" as const, ok: true }));
    const limiter = inMemoryRateLimiter({ perMinute: 1 });
    let clock = new Date("2026-05-04T10:00:00.000Z");
    const now = () => clock;
    const first = await executeAutomation(
      {
        plan: { automation_id: "a-1", actions: [{ type: "tag", tag: "x" }] },
        triggerEventId: "sig-1:t1",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false, rateLimiter: limiter, now },
    );
    expect(first.status).toBe("succeeded");
    clock = new Date("2026-05-04T10:01:30.000Z");
    const second = await executeAutomation(
      {
        plan: { automation_id: "a-1", actions: [{ type: "tag", tag: "y" }] },
        triggerEventId: "sig-2:t2",
        signalId: "sig-2",
      },
      store,
      { handler, internalActionsAppliedByUpsert: false, rateLimiter: limiter, now },
    );
    expect(second.status).toBe("succeeded");
  });

  it("internal-action handler is a no-op when upsert already applied them", async () => {
    const store = memoryRunsStore();
    const handler = vi.fn(async () => ({
      type: "tag" as const,
      ok: true,
    }));
    await executeAutomation(
      {
        plan: {
          automation_id: "a-1",
          actions: [{ type: "tag", tag: "x" }],
        },
        triggerEventId: "sig-1:t",
        signalId: "sig-1",
      },
      store,
      { handler, internalActionsAppliedByUpsert: true },
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.rows[0].status).toBe("succeeded");
  });
});
