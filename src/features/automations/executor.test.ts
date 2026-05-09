import { describe, expect, it, vi } from "vitest";
import {
  type AutomationRunInsert,
  type AutomationRunsStore,
  executeAutomation,
  type FocusReplyDedupe,
  inMemoryRateLimiter,
  type RateLimiter,
} from "#/features/automations/executor";
import type { StoredSignal } from "#/shared/signal";

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
      {
        handler,
        internalActionsAppliedByUpsert: false,
        rateLimiter: limiter,
        now,
      },
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
      {
        handler,
        internalActionsAppliedByUpsert: false,
        rateLimiter: limiter,
        now,
      },
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
      {
        handler,
        internalActionsAppliedByUpsert: false,
        rateLimiter: limiter,
        now,
      },
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
      {
        handler,
        internalActionsAppliedByUpsert: false,
        rateLimiter: limiter,
        now,
      },
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

describe("executeAutomation — focus auto-reply soft idempotency (issue #94)", () => {
  function makeSlackSignal(threadTs: string): StoredSignal {
    return {
      id: "sig-slack-1",
      provider: "slack",
      kind: "dm",
      source_id: `C-1:${threadTs}`,
      title: "hey are you around?",
      url: null,
      payload: {
        channel: "C-1",
        ts: threadTs,
        thread_ts: threadTs,
        author: "U2",
        text: "hey are you around?",
      },
      requires_action: true,
      source_created_at: "2026-05-04T10:00:00.000Z",
      unread_count: 0,
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T10:00:00.000Z",
      dismissed_at: null,
      priority: null,
      snoozed_until: null,
      alert_channels_override: null,
      tags: null,
    };
  }

  function memoryDedupe(): FocusReplyDedupe & {
    reservations: Set<string>;
  } {
    const reservations = new Set<string>();
    return {
      reservations,
      reserve: async (focusSessionId, slackThreadTs) => {
        const key = `${focusSessionId}:${slackThreadTs}`;
        if (reservations.has(key)) return false;
        reservations.add(key);
        return true;
      },
    };
  }

  it("first auto-reply within a Focus session reserves the (session, thread) pair and dispatches", async () => {
    const store = memoryRunsStore();
    const dedupe = memoryDedupe();
    const handler = vi.fn(async () => ({
      type: "post_message" as const,
      ok: true,
      ref: { channel: "C-1", ts: "1700.111" },
    }));
    const result = await executeAutomation(
      {
        plan: {
          automation_id: "a-focus-reply",
          actions: [
            {
              type: "post_message",
              target: "thread_reply",
              body: "heads-down — react 🚨 if urgent",
            },
          ],
        },
        triggerEventId: "sig-slack-1:t1",
        signalId: "sig-slack-1",
        signal: makeSlackSignal("1700.000"),
        activeFocusSessionId: "focus-1",
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: dedupe,
      },
    );
    expect(result.status).toBe("succeeded");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(dedupe.reservations.has("focus-1:1700.000")).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe("succeeded");
  });

  it("second auto-reply on the same thread within the same Focus session short-circuits to skipped_idempotent without invoking the handler", async () => {
    const store = memoryRunsStore();
    const dedupe = memoryDedupe();
    const handler = vi.fn(async () => ({
      type: "post_message" as const,
      ok: true,
    }));
    const baseInput = {
      plan: {
        automation_id: "a-focus-reply",
        actions: [
          {
            type: "post_message" as const,
            target: "thread_reply" as const,
            body: "heads-down",
          },
        ],
      },
      signal: makeSlackSignal("1700.000"),
      activeFocusSessionId: "focus-1",
    };
    const first = await executeAutomation(
      {
        ...baseInput,
        triggerEventId: "sig-slack-1:t1",
        signalId: "sig-slack-1",
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: dedupe,
      },
    );
    expect(first.status).toBe("succeeded");
    expect(handler).toHaveBeenCalledTimes(1);

    // A second Slack DM lands in the same thread → distinct trigger_event_id,
    // so the hard idempotency index doesn't catch it. The soft dedupe must.
    const second = await executeAutomation(
      {
        ...baseInput,
        triggerEventId: "sig-slack-1:t2",
        signalId: "sig-slack-1",
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: dedupe,
      },
    );
    expect(second.status).toBe("skipped_idempotent");
    expect(second.executed).toEqual([]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1].status).toBe("skipped_idempotent");
    expect(store.rows[1].actions_executed).toEqual([]);
  });

  it("a different Focus session re-uses the same thread without short-circuiting", async () => {
    const store = memoryRunsStore();
    const dedupe = memoryDedupe();
    const handler = vi.fn(async () => ({
      type: "post_message" as const,
      ok: true,
    }));
    const signal = makeSlackSignal("1700.000");
    await executeAutomation(
      {
        plan: {
          automation_id: "a-focus-reply",
          actions: [
            { type: "post_message", target: "thread_reply", body: "x" },
          ],
        },
        triggerEventId: "sig-slack-1:t1",
        signalId: "sig-slack-1",
        signal,
        activeFocusSessionId: "focus-1",
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: dedupe,
      },
    );
    const second = await executeAutomation(
      {
        plan: {
          automation_id: "a-focus-reply",
          actions: [
            { type: "post_message", target: "thread_reply", body: "x" },
          ],
        },
        triggerEventId: "sig-slack-1:t2",
        signalId: "sig-slack-1",
        signal,
        activeFocusSessionId: "focus-2",
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: dedupe,
      },
    );
    expect(second.status).toBe("succeeded");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("does not consult the dedupe store when no Focus session is active", async () => {
    const store = memoryRunsStore();
    const reserve = vi.fn(async () => true);
    const handler = vi.fn(async () => ({
      type: "post_message" as const,
      ok: true,
    }));
    await executeAutomation(
      {
        plan: {
          automation_id: "a-focus-reply",
          actions: [
            { type: "post_message", target: "thread_reply", body: "x" },
          ],
        },
        triggerEventId: "sig-slack-1:t1",
        signalId: "sig-slack-1",
        signal: makeSlackSignal("1700.000"),
        activeFocusSessionId: null,
      },
      store,
      {
        handler,
        internalActionsAppliedByUpsert: false,
        focusReplyDedupe: { reserve },
      },
    );
    expect(reserve).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
