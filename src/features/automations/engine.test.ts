import { describe, expect, it } from "vitest";
import {
  type Automation,
  applyAutomationsToSignal,
  cronExpressionValid,
  cronMatchesMinute,
  humanizeCron,
  minuteIsoFromDate,
  planAutomations,
  previewAutomations,
  validateAutomations,
} from "#/features/automations/engine";
import type { Signal } from "#/shared/signal";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    provider: "github",
    kind: "pr_review_requested",
    source_id: "pr-1",
    title: "feat: add knobs",
    url: "https://github.com/x/y/pull/1",
    payload: { author: "alice", repo: "x/y" },
    requires_action: true,
    source_created_at: "2026-05-04T10:00:00.000Z",
    ...overrides,
  };
}

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a-1",
    name: "automation",
    enabled: true,
    priority: 100,
    trigger_kind: "signal_ingested",
    predicates: [{ type: "kind", kind: "pr_review_requested" }],
    actions: [{ type: "tag", tag: "review" }],
    ...overrides,
  };
}

describe("planAutomations", () => {
  it("only fires automations whose trigger_kind matches the event", () => {
    const a = makeAutomation();
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [a],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["a-1"]);
  });

  it("returns one entry per matched automation in priority-asc order", () => {
    const high = makeAutomation({ id: "high", priority: 200 });
    const low = makeAutomation({ id: "low", priority: 1 });
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [high, low],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["low", "high"]);
  });

  it("skips disabled automations", () => {
    const a = makeAutomation({ enabled: false });
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("skips automations with empty predicates", () => {
    const a = makeAutomation({ predicates: [] });
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [a],
    );
    expect(out).toEqual([]);
  });
});

describe("applyAutomationsToSignal — predicates", () => {
  it("matches by provider", () => {
    const a = makeAutomation({
      predicates: [{ type: "provider", provider: "slack" }],
      actions: [{ type: "tag", tag: "chat" }],
    });
    expect(
      applyAutomationsToSignal(makeSignal({ provider: "slack" }), [a]).tags,
    ).toEqual(["chat"]);
    expect(
      applyAutomationsToSignal(makeSignal({ provider: "github" }), [a])
        .matched_automation_ids,
    ).toEqual([]);
  });

  it("matches by kind", () => {
    const a = makeAutomation({
      predicates: [{ type: "kind", kind: "mention" }],
      actions: [{ type: "tag", tag: "ping" }],
    });
    expect(
      applyAutomationsToSignal(makeSignal({ kind: "mention" }), [a]).tags,
    ).toEqual(["ping"]);
    expect(
      applyAutomationsToSignal(makeSignal({ kind: "dm" }), [a])
        .matched_automation_ids,
    ).toEqual([]);
  });

  it("matches by source_match against payload field", () => {
    const a = makeAutomation({
      predicates: [
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      actions: [{ type: "dismiss" }],
    });
    const dependabot = makeSignal({ payload: { author: "dependabot" } });
    const human = makeSignal({ payload: { author: "alice" } });
    expect(applyAutomationsToSignal(dependabot, [a]).dismissed).toBe(true);
    expect(applyAutomationsToSignal(human, [a]).dismissed).toBe(false);
  });

  it("matches by title_regex", () => {
    const a = makeAutomation({
      predicates: [{ type: "title_regex", pattern: "^chore" }],
      actions: [{ type: "tag", tag: "chore" }],
    });
    expect(
      applyAutomationsToSignal(makeSignal({ title: "chore: bump deps" }), [a])
        .tags,
    ).toEqual(["chore"]);
    expect(
      applyAutomationsToSignal(makeSignal({ title: "feat: x" }), [a])
        .matched_automation_ids,
    ).toEqual([]);
  });

  it("invalid regex never matches", () => {
    const a = makeAutomation({
      predicates: [{ type: "title_regex", pattern: "(unclosed" }],
      actions: [{ type: "tag", tag: "x" }],
    });
    expect(
      applyAutomationsToSignal(makeSignal(), [a]).matched_automation_ids,
    ).toEqual([]);
  });

  it("AND-combines multiple predicates", () => {
    const a = makeAutomation({
      predicates: [
        { type: "provider", provider: "github" },
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      actions: [{ type: "dismiss" }],
    });
    expect(
      applyAutomationsToSignal(
        makeSignal({ payload: { author: "dependabot" } }),
        [a],
      ).dismissed,
    ).toBe(true);
    expect(
      applyAutomationsToSignal(makeSignal({ payload: { author: "alice" } }), [
        a,
      ]).dismissed,
    ).toBe(false);
  });
});

describe("applyAutomationsToSignal — actions", () => {
  it("dismiss sets dismissed=true", () => {
    const a = makeAutomation({ actions: [{ type: "dismiss" }] });
    expect(applyAutomationsToSignal(makeSignal(), [a]).dismissed).toBe(true);
  });

  it("snooze sets snoozed_until = now + minutes", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const a = makeAutomation({ actions: [{ type: "snooze", minutes: 60 }] });
    const out = applyAutomationsToSignal(makeSignal(), [a], now);
    expect(out.snoozed_until).toBe("2026-05-04T13:00:00.000Z");
  });

  it("snooze with non-positive minutes is a no-op", () => {
    const a = makeAutomation({ actions: [{ type: "snooze", minutes: 0 }] });
    expect(
      applyAutomationsToSignal(makeSignal(), [a]).snoozed_until,
    ).toBeNull();
  });

  it("multiple snoozes pick the latest", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const out = applyAutomationsToSignal(
      makeSignal(),
      [
        makeAutomation({
          id: "a",
          priority: 1,
          actions: [{ type: "snooze", minutes: 30 }],
        }),
        makeAutomation({
          id: "b",
          priority: 2,
          actions: [{ type: "snooze", minutes: 120 }],
        }),
      ],
      now,
    );
    expect(out.snoozed_until).toBe("2026-05-04T14:00:00.000Z");
  });

  it("set_priority effect sets priority on the application", () => {
    const a = makeAutomation({
      actions: [{ type: "set_priority", value: "high" }],
    });
    expect(applyAutomationsToSignal(makeSignal(), [a]).priority).toBe("high");
  });

  it("higher-priority automation wins last on set_priority", () => {
    const out = applyAutomationsToSignal(
      makeSignal(),
      [
        makeAutomation({
          id: "a",
          priority: 1,
          actions: [{ type: "set_priority", value: "low" }],
        }),
        makeAutomation({
          id: "b",
          priority: 2,
          actions: [{ type: "set_priority", value: "high" }],
        }),
      ],
      new Date(),
    );
    expect(out.priority).toBe("high");
  });

  it("priority defaults to null when no automation sets it", () => {
    expect(applyAutomationsToSignal(makeSignal(), []).priority).toBeNull();
    const a = makeAutomation({ actions: [{ type: "tag", tag: "x" }] });
    expect(applyAutomationsToSignal(makeSignal(), [a]).priority).toBeNull();
  });

  it("set_channels effect sets channels on the application", () => {
    const a = makeAutomation({
      actions: [{ type: "set_channels", channels: ["slack_dm", "email"] }],
    });
    expect(applyAutomationsToSignal(makeSignal(), [a]).channels).toEqual([
      "slack_dm",
      "email",
    ]);
  });

  it("set_channels effect dedupes and drops unknown channels", () => {
    const a = makeAutomation({
      actions: [
        {
          type: "set_channels",
          channels: [
            "slack_dm",
            "slack_dm",
            "bogus" as unknown as "email",
            "email",
          ],
        },
      ],
    });
    expect(applyAutomationsToSignal(makeSignal(), [a]).channels).toEqual([
      "slack_dm",
      "email",
    ]);
  });

  it("set_channels with empty list resolves to empty array (not null)", () => {
    const a = makeAutomation({
      actions: [{ type: "set_channels", channels: [] }],
    });
    expect(applyAutomationsToSignal(makeSignal(), [a]).channels).toEqual([]);
  });

  it("tags accumulate without duplicates", () => {
    const out = applyAutomationsToSignal(
      makeSignal(),
      [
        makeAutomation({
          id: "a",
          priority: 1,
          actions: [{ type: "tag", tag: "x" }],
        }),
        makeAutomation({
          id: "b",
          priority: 2,
          actions: [{ type: "tag", tag: "y" }],
        }),
        makeAutomation({
          id: "c",
          priority: 3,
          actions: [{ type: "tag", tag: "x" }],
        }),
      ],
      new Date(),
    );
    expect(out.tags).toEqual(["x", "y"]);
    expect(out.matched_automation_ids).toEqual(["a", "b", "c"]);
  });
});

describe("applyAutomationsToSignal — ordering and gating", () => {
  it("respects priority order in matched_automation_ids", () => {
    const out = applyAutomationsToSignal(
      makeSignal(),
      [
        makeAutomation({
          id: "high",
          priority: 200,
          actions: [{ type: "tag", tag: "h" }],
        }),
        makeAutomation({
          id: "low",
          priority: 1,
          actions: [{ type: "tag", tag: "l" }],
        }),
      ],
      new Date(),
    );
    expect(out.matched_automation_ids).toEqual(["low", "high"]);
    expect(out.tags).toEqual(["l", "h"]);
  });

  it("disabled automations do not fire", () => {
    const a = makeAutomation({
      enabled: false,
      actions: [{ type: "dismiss" }],
    });
    expect(applyAutomationsToSignal(makeSignal(), [a]).dismissed).toBe(false);
  });

  it("integration: dependabot PR lands snoozed", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const a: Automation = {
      id: "snooze-dependabot",
      name: "Snooze dependabot",
      enabled: true,
      priority: 1,
      trigger_kind: "signal_ingested",
      predicates: [
        { type: "provider", provider: "github" },
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      actions: [
        { type: "snooze", minutes: 60 * 24 },
        { type: "tag", tag: "deps" },
      ],
    };
    const out = applyAutomationsToSignal(
      makeSignal({ payload: { author: "dependabot", repo: "x/y" } }),
      [a],
      now,
    );
    expect(out.dismissed).toBe(false);
    expect(out.snoozed_until).toBe("2026-05-05T12:00:00.000Z");
    expect(out.tags).toEqual(["deps"]);
    expect(out.matched_automation_ids).toEqual(["snooze-dependabot"]);
  });
});

describe("planAutomations — signal_state_change", () => {
  function makeStateChangeAutomation(
    overrides: Partial<Automation> = {},
  ): Automation {
    return {
      id: "merged-1",
      name: "PR merged",
      enabled: true,
      priority: 100,
      trigger_kind: "signal_state_change",
      predicates: [
        { type: "state_from_to", field: "merged", from: "false", to: "true" },
      ],
      actions: [{ type: "tag", tag: "merged" }],
      ...overrides,
    };
  }

  it("fires when the payload field transitions from `from` to `to`", () => {
    const before = makeSignal({ payload: { merged: false } });
    const after = makeSignal({ payload: { merged: true } });
    const out = planAutomations(
      { kind: "signal_state_change", before, after },
      [makeStateChangeAutomation()],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["merged-1"]);
  });

  it("does not fire when the field never changes", () => {
    const before = makeSignal({ payload: { merged: true } });
    const after = makeSignal({ payload: { merged: true } });
    const out = planAutomations(
      { kind: "signal_state_change", before, after },
      [makeStateChangeAutomation()],
    );
    expect(out).toEqual([]);
  });

  it("`to` alone matches any prior value", () => {
    const a = makeStateChangeAutomation({
      predicates: [{ type: "state_from_to", field: "state", to: "approved" }],
    });
    const out = planAutomations(
      {
        kind: "signal_state_change",
        before: makeSignal({ payload: { state: "open" } }),
        after: makeSignal({ payload: { state: "approved" } }),
      },
      [a],
    );
    expect(out).toHaveLength(1);
  });

  it("`from` alone matches any next value", () => {
    const a = makeStateChangeAutomation({
      predicates: [{ type: "state_from_to", field: "state", from: "open" }],
    });
    const out = planAutomations(
      {
        kind: "signal_state_change",
        before: makeSignal({ payload: { state: "open" } }),
        after: makeSignal({ payload: { state: "closed" } }),
      },
      [a],
    );
    expect(out).toHaveLength(1);
  });

  it("predicate with neither from nor to never matches", () => {
    const a = makeStateChangeAutomation({
      predicates: [
        { type: "state_from_to", field: "merged" } as never,
      ],
    });
    const out = planAutomations(
      {
        kind: "signal_state_change",
        before: makeSignal({ payload: { merged: false } }),
        after: makeSignal({ payload: { merged: true } }),
      },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("AND-combines state_from_to with regular predicates", () => {
    const a = makeStateChangeAutomation({
      predicates: [
        { type: "provider", provider: "github" },
        { type: "state_from_to", field: "merged", to: "true" },
      ],
    });
    const before = makeSignal({ payload: { merged: false } });
    const afterMatch = makeSignal({ payload: { merged: true } });
    const afterOtherProvider = makeSignal({
      provider: "slack",
      payload: { merged: true },
    });
    expect(
      planAutomations(
        { kind: "signal_state_change", before, after: afterMatch },
        [a],
      ),
    ).toHaveLength(1);
    expect(
      planAutomations(
        {
          kind: "signal_state_change",
          before,
          after: afterOtherProvider,
        },
        [a],
      ),
    ).toEqual([]);
  });

  it("a signal_state_change automation does not fire on signal_ingested events", () => {
    const a = makeStateChangeAutomation();
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("a signal_ingested automation does not fire on state_change events", () => {
    const a = makeAutomation();
    const out = planAutomations(
      {
        kind: "signal_state_change",
        before: makeSignal(),
        after: makeSignal(),
      },
      [a],
    );
    expect(out).toEqual([]);
  });
});

describe("planAutomations — focus boundary events", () => {
  function makeFocusAutomation(
    overrides: Partial<Automation> = {},
  ): Automation {
    return {
      id: "focus-1",
      name: "Focus auto-reply",
      enabled: true,
      priority: 100,
      trigger_kind: "focus_started",
      predicates: [],
      actions: [{ type: "tag", tag: "focus" }],
      ...overrides,
    };
  }

  it("focus_started fires when an automation has matching trigger_kind and no predicates", () => {
    const out = planAutomations(
      {
        kind: "focus_started",
        session_id: "sess-1",
        duration_minutes: 25,
      },
      [makeFocusAutomation()],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["focus-1"]);
  });

  it("focus_ended fires only on focus_ended automations", () => {
    const started = makeFocusAutomation({
      id: "started",
      trigger_kind: "focus_started",
    });
    const ended = makeFocusAutomation({
      id: "ended",
      trigger_kind: "focus_ended",
    });
    const out = planAutomations(
      {
        kind: "focus_ended",
        session_id: "sess-1",
        duration_minutes: 25,
      },
      [started, ended],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["ended"]);
  });

  it("a focus automation does not fire on signal_ingested events", () => {
    const a = makeFocusAutomation();
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("a signal automation does not fire on focus boundaries", () => {
    const a = makeAutomation();
    const out = planAutomations(
      {
        kind: "focus_started",
        session_id: "sess-1",
        duration_minutes: 25,
      },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("a focus automation with a Signal-shaped predicate never matches", () => {
    const a = makeFocusAutomation({
      predicates: [{ type: "kind", kind: "mention" }],
    });
    const out = planAutomations(
      {
        kind: "focus_started",
        session_id: "sess-1",
        duration_minutes: 25,
      },
      [a],
    );
    expect(out).toEqual([]);
  });

  it("respects the disabled flag for focus automations", () => {
    const a = makeFocusAutomation({ enabled: false });
    const out = planAutomations(
      {
        kind: "focus_started",
        session_id: "sess-1",
        duration_minutes: 25,
      },
      [a],
    );
    expect(out).toEqual([]);
  });
});

describe("previewAutomations", () => {
  it("keeps only signals that any automation fired on, preserving order", () => {
    const automation = makeAutomation({
      predicates: [
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      actions: [{ type: "dismiss" }],
    });
    const matched = makeSignal({
      source_id: "pr-1",
      payload: { author: "dependabot" },
    });
    const skipped = makeSignal({
      source_id: "pr-2",
      payload: { author: "alice" },
    });
    const matched2 = makeSignal({
      source_id: "pr-3",
      payload: { author: "dependabot" },
    });
    const out = previewAutomations([matched, skipped, matched2], [automation]);
    expect(out.map((r) => r.signal.source_id)).toEqual(["pr-1", "pr-3"]);
    expect(out[0].application.dismissed).toBe(true);
    expect(out[0].application.matched_automation_ids).toEqual(["a-1"]);
  });

  it("returns an empty list when no automation fires", () => {
    const automation = makeAutomation({
      predicates: [{ type: "kind", kind: "ticket_blocked" }],
      actions: [{ type: "tag", tag: "blocked" }],
    });
    expect(previewAutomations([makeSignal()], [automation])).toEqual([]);
  });
});

describe("validateAutomations", () => {
  it("returns no errors for a valid automation list", () => {
    expect(validateAutomations([])).toEqual([]);
    expect(
      validateAutomations([
        {
          id: "a-1",
          name: "x",
          enabled: true,
          priority: 1,
          trigger_kind: "signal_ingested",
          predicates: [{ type: "kind", kind: "mention" }],
          actions: [{ type: "tag", tag: "x" }],
        },
      ]),
    ).toEqual([]);
  });

  it("flags missing fields", () => {
    const errs = validateAutomations([
      {
        id: "",
        name: "",
        enabled: true,
        priority: Number.NaN,
        trigger_kind: "signal_ingested",
        predicates: [],
        actions: [],
      } as unknown as Automation,
    ]);
    expect(errs.length).toBeGreaterThan(0);
  });

  it("flags duplicate ids", () => {
    const a: Automation = {
      id: "x",
      name: "n",
      enabled: true,
      priority: 1,
      trigger_kind: "signal_ingested",
      predicates: [{ type: "kind", kind: "mention" }],
      actions: [{ type: "tag", tag: "t" }],
    };
    const errs = validateAutomations([a, { ...a }]);
    expect(errs.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("flags invalid regex predicates", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_ingested",
        predicates: [{ type: "title_regex", pattern: "(unclosed" }],
        actions: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(errs.some((e) => e.includes("invalid regex"))).toBe(true);
  });

  it("flags unknown trigger kinds", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "webhook" as unknown as "signal_ingested",
        predicates: [{ type: "kind", kind: "mention" }],
        actions: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(errs.some((e) => e.includes("trigger_kind"))).toBe(true);
  });

  it("flags unknown action types", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_ingested",
        predicates: [{ type: "kind", kind: "mention" }],
        actions: [
          { type: "frobnicate" } as unknown as { type: "tag"; tag: string },
        ],
      },
    ]);
    expect(errs.some((e) => e.includes("unknown action type"))).toBe(true);
  });

  it("flags state_from_to without from or to", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_state_change",
        predicates: [{ type: "state_from_to", field: "merged" }],
        actions: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(
      errs.some((e) => e.includes("state_from_to requires at least one")),
    ).toBe(true);
  });

  it("accepts signal_state_change as a valid trigger kind", () => {
    expect(
      validateAutomations([
        {
          id: "x",
          name: "n",
          enabled: true,
          priority: 1,
          trigger_kind: "signal_state_change",
          predicates: [{ type: "state_from_to", field: "merged", to: "true" }],
          actions: [{ type: "tag", tag: "t" }],
        },
      ]),
    ).toEqual([]);
  });

  it("accepts focus_started / focus_ended trigger kinds", () => {
    expect(
      validateAutomations([
        {
          id: "f-start",
          name: "n",
          enabled: true,
          priority: 1,
          trigger_kind: "focus_started",
          predicates: [],
          actions: [{ type: "tag", tag: "t" }],
        },
        {
          id: "f-end",
          name: "n",
          enabled: true,
          priority: 1,
          trigger_kind: "focus_ended",
          predicates: [],
          actions: [{ type: "set_focus", duration_minutes: 25 }],
        },
      ]),
    ).toEqual([]);
  });

  it("flags non-positive set_focus.duration_minutes", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "focus_started",
        predicates: [],
        actions: [{ type: "set_focus", duration_minutes: 0 }],
      },
    ]);
    expect(errs.some((e) => e.includes("set_focus.duration_minutes"))).toBe(
      true,
    );
  });

  it("accepts a post_message action with target self_dm and a body", () => {
    expect(
      validateAutomations([
        {
          id: "p",
          name: "n",
          enabled: true,
          priority: 1,
          trigger_kind: "schedule",
          trigger_config: { cron: "0 9 * * 1-5" },
          predicates: [],
          actions: [
            { type: "post_message", target: "self_dm", body: "hello" },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("flags post_message with target=channel but no channel", () => {
    const errs = validateAutomations([
      {
        id: "p",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_ingested",
        predicates: [{ type: "kind", kind: "mention" }],
        actions: [{ type: "post_message", target: "channel", body: "hi" }],
      },
    ]);
    expect(
      errs.some((e) => e.includes("post_message with target \"channel\"")),
    ).toBe(true);
  });

  it("flags post_message with an unknown target", () => {
    const errs = validateAutomations([
      {
        id: "p",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_ingested",
        predicates: [{ type: "kind", kind: "mention" }],
        actions: [
          {
            type: "post_message",
            // biome-ignore lint/suspicious/noExplicitAny: covering the runtime branch
            target: "bogus" as any,
            body: "hi",
          },
        ],
      },
    ]);
    expect(errs.some((e) => e.includes("post_message.target"))).toBe(true);
  });

  it("flags negative snooze.minutes", () => {
    const errs = validateAutomations([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "signal_ingested",
        predicates: [{ type: "kind", kind: "mention" }],
        actions: [{ type: "snooze", minutes: -5 }],
      },
    ]);
    expect(errs.some((e) => e.includes("snooze.minutes"))).toBe(true);
  });
});

describe("cronMatchesMinute", () => {
  it("matches a fully-specified minute", () => {
    // 2026-05-04T09:00:00Z is a Monday.
    expect(cronMatchesMinute("0 9 * * 1-5", "2026-05-04T09:00:00.000Z")).toBe(
      true,
    );
  });

  it("does not match on a non-matching minute", () => {
    expect(cronMatchesMinute("0 9 * * 1-5", "2026-05-04T09:01:00.000Z")).toBe(
      false,
    );
  });

  it("does not match on Saturday for a weekday-only cron", () => {
    // 2026-05-09T09:00:00Z is a Saturday.
    expect(cronMatchesMinute("0 9 * * 1-5", "2026-05-09T09:00:00.000Z")).toBe(
      false,
    );
  });

  it("supports `*` wildcard fields", () => {
    expect(cronMatchesMinute("* * * * *", "2026-05-04T09:01:00.000Z")).toBe(
      true,
    );
  });

  it("supports step expressions", () => {
    expect(cronMatchesMinute("*/15 * * * *", "2026-05-04T09:00:00.000Z")).toBe(
      true,
    );
    expect(cronMatchesMinute("*/15 * * * *", "2026-05-04T09:15:00.000Z")).toBe(
      true,
    );
    expect(cronMatchesMinute("*/15 * * * *", "2026-05-04T09:14:00.000Z")).toBe(
      false,
    );
  });

  it("supports comma lists", () => {
    expect(
      cronMatchesMinute("0 9,17 * * 1-5", "2026-05-04T17:00:00.000Z"),
    ).toBe(true);
    expect(
      cronMatchesMinute("0 9,17 * * 1-5", "2026-05-04T13:00:00.000Z"),
    ).toBe(false);
  });

  it("treats day-of-week 0 and 7 as Sunday", () => {
    // 2026-05-10 is a Sunday.
    expect(cronMatchesMinute("0 9 * * 0", "2026-05-10T09:00:00.000Z")).toBe(
      true,
    );
    expect(cronMatchesMinute("0 9 * * 7", "2026-05-10T09:00:00.000Z")).toBe(
      true,
    );
  });

  it("invalid cron never matches", () => {
    expect(cronMatchesMinute("not-a-cron", "2026-05-04T09:00:00.000Z")).toBe(
      false,
    );
    expect(cronMatchesMinute("99 * * * *", "2026-05-04T09:00:00.000Z")).toBe(
      false,
    );
  });
});

describe("cronExpressionValid", () => {
  it("accepts standard 5-field cron", () => {
    expect(cronExpressionValid("0 9 * * 1-5")).toBe(true);
    expect(cronExpressionValid("*/5 * * * *")).toBe(true);
    expect(cronExpressionValid("0 0,12 1 * *")).toBe(true);
  });

  it("rejects malformed cron", () => {
    expect(cronExpressionValid("")).toBe(false);
    expect(cronExpressionValid("0 9 * *")).toBe(false);
    expect(cronExpressionValid("99 * * * *")).toBe(false);
    expect(cronExpressionValid("0 9 * * 8")).toBe(false);
    expect(cronExpressionValid("a b c d e")).toBe(false);
  });
});

describe("humanizeCron", () => {
  it("renders weekday morning shape", () => {
    expect(humanizeCron("0 9 * * 1-5")).toBe("Weekdays · 09:00");
  });

  it("renders single weekday", () => {
    expect(humanizeCron("30 17 * * 5")).toBe("Friday · 17:30");
  });

  it("falls back to the raw expression for unrecognised shapes", () => {
    expect(humanizeCron("*/15 * * * *")).toBe("*/15 * * * *");
    expect(humanizeCron("not-a-cron")).toBe("not-a-cron");
  });
});

describe("minuteIsoFromDate", () => {
  it("truncates to whole minutes", () => {
    expect(minuteIsoFromDate(new Date("2026-05-04T09:00:42.123Z"))).toBe(
      "2026-05-04T09:00:00.000Z",
    );
  });
});

describe("planAutomations — schedule trigger", () => {
  function makeScheduleAutomation(
    overrides: Partial<Automation> = {},
  ): Automation {
    return {
      id: "sched-1",
      name: "9am roundup",
      enabled: true,
      priority: 100,
      trigger_kind: "schedule",
      trigger_config: { cron: "0 9 * * 1-5" },
      predicates: [],
      actions: [{ type: "tag", tag: "schedule" }],
      ...overrides,
    };
  }

  it("fires for an automation whose cron matches the minute", () => {
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:00:00.000Z" },
      [makeScheduleAutomation()],
    );
    expect(out.map((p) => p.automation_id)).toEqual(["sched-1"]);
  });

  it("does not fire when the cron does not match the minute", () => {
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:01:00.000Z" },
      [makeScheduleAutomation()],
    );
    expect(out).toEqual([]);
  });

  it("does not fire on a non-schedule event", () => {
    const out = planAutomations(
      { kind: "signal_ingested", signal: makeSignal() },
      [makeScheduleAutomation()],
    );
    expect(out).toEqual([]);
  });

  it("a signal_ingested automation does not fire on schedule events", () => {
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:00:00.000Z" },
      [makeAutomation()],
    );
    expect(out).toEqual([]);
  });

  it("a disabled schedule automation does not fire even when the cron matches", () => {
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:00:00.000Z" },
      [makeScheduleAutomation({ enabled: false })],
    );
    expect(out).toEqual([]);
  });

  it("a schedule automation without a cron expression does not fire", () => {
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:00:00.000Z" },
      [makeScheduleAutomation({ trigger_config: undefined })],
    );
    expect(out).toEqual([]);
  });
});

describe("validateAutomations — schedule trigger", () => {
  it("accepts a schedule automation with a valid cron", () => {
    expect(
      validateAutomations([
        {
          id: "s",
          name: "n",
          enabled: true,
          priority: 1,
          trigger_kind: "schedule",
          trigger_config: { cron: "0 9 * * 1-5" },
          predicates: [],
          actions: [{ type: "tag", tag: "t" }],
        },
      ]),
    ).toEqual([]);
  });

  it("rejects a schedule automation without a cron", () => {
    const errs = validateAutomations([
      {
        id: "s",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "schedule",
        predicates: [],
        actions: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(
      errs.some((e) => e.includes("schedule trigger requires trigger_config.cron")),
    ).toBe(true);
  });

  it("a disabled schedule fixture (cron 0 9 * * 1-5) does not fire on a matching weekday 9am tick", () => {
    // Mirrors the seeded sixth fixture (issue #99): enabled=false, so the
    // cron-matching minute must still produce no plan.
    const fixture = {
      id: "fixture-99",
      name: "Daily 9am merged-PR roundup",
      enabled: false,
      priority: 100,
      trigger_kind: "schedule" as const,
      trigger_config: { cron: "0 9 * * 1-5" },
      predicates: [],
      actions: [
        {
          type: "post_message" as const,
          target: "self_dm" as const,
          body: "{{schedule.merged_prs_summary}}",
        },
      ],
    };
    // 2026-05-04 is a Monday — within 1-5. Cron would match if enabled.
    const out = planAutomations(
      { kind: "schedule", minute_iso: "2026-05-04T09:00:00.000Z" },
      [fixture],
    );
    expect(out).toEqual([]);
  });

  it("rejects a schedule automation with an invalid cron", () => {
    const errs = validateAutomations([
      {
        id: "s",
        name: "n",
        enabled: true,
        priority: 1,
        trigger_kind: "schedule",
        trigger_config: { cron: "99 * * * *" },
        predicates: [],
        actions: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(errs.some((e) => e.includes("invalid cron expression"))).toBe(true);
  });
});
