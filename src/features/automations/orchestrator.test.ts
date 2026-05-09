import { describe, expect, it } from "vitest";
import type { Automation } from "#/features/automations/engine";
import type {
  AutomationRunInsert,
  AutomationRunsStore,
} from "#/features/automations/executor";
import {
  runAutomationsForInsertedSignals,
  runAutomationsForUpdatedSignals,
  runFocusBoundaryAutomation,
  runScheduleAutomations,
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

  it("a dry_run automation lands as skipped_dry_run with planned-but-not-executed actions", async () => {
    const store = memoryRunsStore();
    const handler = async () => ({ type: "tag" as const, ok: true });
    const out = await runAutomationsForInsertedSignals(
      [makeStored()],
      [{ ...dependabotAutomation, dry_run: true }],
      store,
      { internalActionsAppliedByUpsert: false, handler },
    );
    expect(out[0].results[0].status).toBe("skipped_dry_run");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].status).toBe("skipped_dry_run");
    expect(store.rows[0].actions_planned.map((a) => a.type)).toEqual([
      "snooze",
    ]);
    expect(store.rows[0].actions_executed).toEqual([]);
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

const prMergedAutomation: Automation = {
  id: "pr-merged",
  name: "Tag merged PRs",
  enabled: true,
  priority: 1,
  trigger_kind: "signal_state_change",
  predicates: [
    { type: "state_from_to", field: "merged", from: "false", to: "true" },
  ],
  actions: [{ type: "tag", tag: "merged" }],
};

describe("runAutomationsForUpdatedSignals", () => {
  it("happy path: PR merged update lands one succeeded run row", async () => {
    const store = memoryRunsStore();
    const before: Signal = {
      provider: "github",
      kind: "pr_authored",
      source_id: "pr-1",
      title: "feat: x",
      url: null,
      payload: { merged: false },
      requires_action: true,
      source_created_at: "2026-05-04T10:00:00.000Z",
    };
    const after = makeStored({
      kind: "pr_authored",
      payload: { merged: true },
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T11:00:00.000Z",
    });
    const out = await runAutomationsForUpdatedSignals(
      [{ before, after }],
      [prMergedAutomation],
      store,
    );
    expect(out).toHaveLength(1);
    expect(out[0].results).toHaveLength(1);
    expect(out[0].results[0].status).toBe("succeeded");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].trigger_event_id).toBe(
      "sig-1:2026-05-04T11:00:00.000Z",
    );
  });

  it("re-poll of the same updated signal short-circuits to skipped_idempotent", async () => {
    const store = memoryRunsStore();
    const before: Signal = {
      provider: "github",
      kind: "pr_authored",
      source_id: "pr-1",
      title: "feat: x",
      url: null,
      payload: { merged: false },
      requires_action: true,
      source_created_at: "2026-05-04T10:00:00.000Z",
    };
    const after = makeStored({
      kind: "pr_authored",
      payload: { merged: true },
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T11:00:00.000Z",
    });
    await runAutomationsForUpdatedSignals(
      [{ before, after }],
      [prMergedAutomation],
      store,
    );
    const out = await runAutomationsForUpdatedSignals(
      [{ before, after }],
      [prMergedAutomation],
      store,
    );
    expect(out[0].results[0].status).toBe("skipped_idempotent");
    expect(store.rows).toHaveLength(1);
  });

  it("no transition match → no automation_runs row written", async () => {
    const store = memoryRunsStore();
    const before: Signal = {
      provider: "github",
      kind: "pr_authored",
      source_id: "pr-1",
      title: "feat: x",
      url: null,
      payload: { merged: false },
      requires_action: true,
      source_created_at: "2026-05-04T10:00:00.000Z",
    };
    // unread_count bump but `merged` field unchanged → predicate mismatches
    const after = makeStored({
      kind: "pr_authored",
      payload: { merged: false },
      created_at: "2026-05-04T10:00:00.000Z",
      updated_at: "2026-05-04T11:00:00.000Z",
    });
    const out = await runAutomationsForUpdatedSignals(
      [{ before, after }],
      [prMergedAutomation],
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

const focusStartAutomation: Automation = {
  id: "focus-start",
  name: "Focus auto-tag",
  enabled: true,
  priority: 1,
  trigger_kind: "focus_started",
  predicates: [],
  actions: [{ type: "tag", tag: "focus" }],
};

const focusEndAutomation: Automation = {
  id: "focus-end",
  name: "Focus end set-focus",
  enabled: true,
  priority: 1,
  trigger_kind: "focus_ended",
  predicates: [],
  actions: [{ type: "set_focus", duration_minutes: 25 }],
};

describe("runFocusBoundaryAutomation", () => {
  it("focus_started: writes one succeeded run keyed on ${session_id}:start", async () => {
    const store = memoryRunsStore();
    const out = await runFocusBoundaryAutomation(
      "focus_started",
      "sess-1",
      25,
      [focusStartAutomation],
      store,
    );
    expect(out.results).toHaveLength(1);
    expect(out.results[0].status).toBe("succeeded");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].trigger_event_id).toBe("sess-1:start");
    expect(store.rows[0].signal_id).toBeNull();
  });

  it("focus_ended: dispatches set_focus through the injected handler", async () => {
    const store = memoryRunsStore();
    const calls: Array<{ duration_minutes: number }> = [];
    const out = await runFocusBoundaryAutomation(
      "focus_ended",
      "sess-2",
      25,
      [focusEndAutomation],
      store,
      {
        internalActionsAppliedByUpsert: false,
        handler: async (action) => {
          if (action.type === "set_focus") {
            calls.push({ duration_minutes: action.duration_minutes });
            return { type: action.type, ok: true };
          }
          return { type: action.type, ok: true };
        },
      },
    );
    expect(out.results[0].status).toBe("succeeded");
    expect(calls).toEqual([{ duration_minutes: 25 }]);
    expect(store.rows[0].trigger_event_id).toBe("sess-2:end");
  });

  it("re-emitting the same boundary short-circuits to skipped_idempotent", async () => {
    const store = memoryRunsStore();
    await runFocusBoundaryAutomation(
      "focus_started",
      "sess-3",
      25,
      [focusStartAutomation],
      store,
    );
    const out = await runFocusBoundaryAutomation(
      "focus_started",
      "sess-3",
      25,
      [focusStartAutomation],
      store,
    );
    expect(out.results[0].status).toBe("skipped_idempotent");
    expect(store.rows).toHaveLength(1);
  });

  it("returns an empty result when no automation matches the boundary", async () => {
    const store = memoryRunsStore();
    const out = await runFocusBoundaryAutomation(
      "focus_ended",
      "sess-4",
      25,
      [focusStartAutomation],
      store,
    );
    expect(out.results).toEqual([]);
    expect(store.rows).toHaveLength(0);
  });
});

const scheduledAutomation: Automation = {
  id: "sched-1",
  name: "Weekday 9am roundup",
  enabled: true,
  priority: 1,
  trigger_kind: "schedule",
  trigger_config: { cron: "0 9 * * 1-5" },
  predicates: [],
  actions: [{ type: "tag", tag: "scheduled" }],
};

describe("runScheduleAutomations", () => {
  it("happy path: cron-matching minute writes one succeeded run keyed on automation_id:minute_iso", async () => {
    const store = memoryRunsStore();
    const out = await runScheduleAutomations(
      new Date("2026-05-04T09:00:00.000Z"),
      [scheduledAutomation],
      store,
    );
    expect(out.minuteIso).toBe("2026-05-04T09:00:00.000Z");
    expect(out.results).toHaveLength(1);
    expect(out.results[0].status).toBe("succeeded");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].trigger_event_id).toBe(
      "sched-1:2026-05-04T09:00:00.000Z",
    );
    expect(store.rows[0].signal_id).toBeNull();
  });

  it("non-matching minute writes nothing", async () => {
    const store = memoryRunsStore();
    const out = await runScheduleAutomations(
      new Date("2026-05-04T09:01:00.000Z"),
      [scheduledAutomation],
      store,
    );
    expect(out.results).toEqual([]);
    expect(store.rows).toHaveLength(0);
  });

  it("re-tick of the same minute short-circuits to skipped_idempotent", async () => {
    const store = memoryRunsStore();
    await runScheduleAutomations(
      new Date("2026-05-04T09:00:00.000Z"),
      [scheduledAutomation],
      store,
    );
    const out = await runScheduleAutomations(
      // a few seconds later, same minute
      new Date("2026-05-04T09:00:42.123Z"),
      [scheduledAutomation],
      store,
    );
    expect(out.results[0].status).toBe("skipped_idempotent");
    expect(store.rows).toHaveLength(1);
  });

  it("dispatches set_focus through the injected handler", async () => {
    const store = memoryRunsStore();
    const calls: Array<{ duration_minutes: number }> = [];
    const out = await runScheduleAutomations(
      new Date("2026-05-04T09:00:00.000Z"),
      [
        {
          ...scheduledAutomation,
          actions: [{ type: "set_focus", duration_minutes: 25 }],
        },
      ],
      store,
      {
        internalActionsAppliedByUpsert: false,
        handler: async (action) => {
          if (action.type === "set_focus") {
            calls.push({ duration_minutes: action.duration_minutes });
            return { type: action.type, ok: true };
          }
          return { type: action.type, ok: true };
        },
      },
    );
    expect(out.results[0].status).toBe("succeeded");
    expect(calls).toEqual([{ duration_minutes: 25 }]);
  });
});
