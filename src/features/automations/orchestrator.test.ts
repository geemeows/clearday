import { describe, expect, it } from "vitest";
import type { Automation } from "#/features/automations/engine";
import type {
  AutomationRunInsert,
  AutomationRunsStore,
} from "#/features/automations/executor";
import {
  runAutomationsForInsertedSignals,
  runSignalIngestedAutomations,
  type SignalLookup,
} from "#/features/automations/orchestrator";
import type { Signal, StoredSignal } from "#/shared/signal";

function memoryRunsStore(): AutomationRunsStore & {
  rows: AutomationRunInsert[];
} {
  const rows: AutomationRunInsert[] = [];
  return {
    rows,
    insertIfNew: async (row) => {
      if (
        rows.find(
          (r) =>
            r.automation_id === row.automation_id &&
            r.trigger_event_id === row.trigger_event_id,
        )
      )
        return false;
      rows.push(row);
      return true;
    },
  };
}

function makeStored(overrides: Partial<StoredSignal> = {}): StoredSignal {
  return {
    id: "sig-1",
    provider: "github",
    kind: "pr_review_requested",
    source_id: "pr-1",
    title: "feat: x",
    url: null,
    payload: { author: "dependabot" },
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
    ...overrides,
  };
}

const dependabotAutomation: Automation = {
  id: "a-1",
  name: "snooze deps",
  enabled: true,
  priority: 1,
  trigger_kind: "signal_ingested",
  predicates: [{ type: "source_match", field: "author", equals: "dependabot" }],
  actions: [{ type: "snooze", minutes: 60 }],
};

describe("runAutomationsForInsertedSignals", () => {
  it("happy path: plans and executes one automation per matched signal", async () => {
    const store = memoryRunsStore();
    const out = await runAutomationsForInsertedSignals(
      [makeStored()],
      [dependabotAutomation],
      store,
    );
    expect(out).toHaveLength(1);
    expect(out[0].results).toHaveLength(1);
    expect(out[0].results[0].status).toBe("succeeded");
    expect(store.rows[0].trigger_event_id).toBe(
      "sig-1:2026-05-04T10:00:00.000Z",
    );
  });

  it("a second pass over the same signal lands as skipped_idempotent", async () => {
    const store = memoryRunsStore();
    await runAutomationsForInsertedSignals(
      [makeStored()],
      [dependabotAutomation],
      store,
    );
    const out = await runAutomationsForInsertedSignals(
      [makeStored()],
      [dependabotAutomation],
      store,
    );
    expect(out[0].results[0].status).toBe("skipped_idempotent");
    expect(store.rows).toHaveLength(1);
  });

  it("failure path: handler error is captured and the run is recorded as failed", async () => {
    const store = memoryRunsStore();
    const out = await runAutomationsForInsertedSignals(
      [makeStored()],
      [dependabotAutomation],
      store,
      {
        internalActionsAppliedByUpsert: false,
        handler: async (action) => ({
          type: action.type,
          ok: false,
          error: "kaboom",
        }),
      },
    );
    expect(out[0].results[0].status).toBe("failed");
    expect(store.rows[0].error).toBe("kaboom");
  });

  it("returns an empty result list when no automation matches the signal", async () => {
    const store = memoryRunsStore();
    const out = await runAutomationsForInsertedSignals(
      [makeStored({ payload: { author: "alice" } })],
      [dependabotAutomation],
      store,
    );
    expect(out[0].results).toEqual([]);
    expect(store.rows).toHaveLength(0);
  });
});

describe("runSignalIngestedAutomations — INSERT detection", () => {
  function lookupReturning(rows: StoredSignal[]): SignalLookup {
    return {
      resolve: async () => rows,
    };
  }

  const inputSignal: Signal = {
    provider: "github",
    kind: "pr_review_requested",
    source_id: "pr-1",
    title: "feat: x",
    url: null,
    payload: { author: "dependabot" },
    requires_action: true,
    source_created_at: "2026-05-04T10:00:00.000Z",
  };

  it("dispatches when created_at == updated_at (fresh insert)", async () => {
    const store = memoryRunsStore();
    const out = await runSignalIngestedAutomations(
      [inputSignal],
      [dependabotAutomation],
      lookupReturning([makeStored()]),
      store,
    );
    expect(out[0].results[0].status).toBe("succeeded");
  });

  it("does not dispatch when created_at != updated_at (re-poll updates an existing row)", async () => {
    const store = memoryRunsStore();
    const out = await runSignalIngestedAutomations(
      [inputSignal],
      [dependabotAutomation],
      lookupReturning([
        makeStored({
          created_at: "2026-05-04T10:00:00.000Z",
          updated_at: "2026-05-04T10:05:00.000Z",
        }),
      ]),
      store,
    );
    expect(out).toEqual([]);
    expect(store.rows).toHaveLength(0);
  });
});
