import { describe, expect, it, vi } from "vitest";
import {
  type AutomationRunInsert,
  type AutomationRunsStore,
  executeAutomation,
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
