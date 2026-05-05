import { describe, expect, it } from "vitest";
import {
  applyInboxRules,
  type InboxRule,
  previewInboxRules,
  validateInboxRules,
} from "#/lib/inbox-rules-engine";
import type { Signal } from "#/lib/signal";

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

function makeRule(overrides: Partial<InboxRule> = {}): InboxRule {
  return {
    id: "r-1",
    name: "rule",
    enabled: true,
    priority: 100,
    predicates: [{ type: "kind", kind: "pr_review_requested" }],
    effects: [{ type: "tag", tag: "review" }],
    ...overrides,
  };
}

describe("applyInboxRules — predicates", () => {
  it("matches by provider", () => {
    const r = makeRule({
      predicates: [{ type: "provider", provider: "slack" }],
      effects: [{ type: "tag", tag: "chat" }],
    });
    expect(
      applyInboxRules(makeSignal({ provider: "slack" }), [r]).tags,
    ).toEqual(["chat"]);
    expect(
      applyInboxRules(makeSignal({ provider: "github" }), [r]).matched_rule_ids,
    ).toEqual([]);
  });

  it("matches by kind", () => {
    const r = makeRule({
      predicates: [{ type: "kind", kind: "mention" }],
      effects: [{ type: "tag", tag: "ping" }],
    });
    expect(applyInboxRules(makeSignal({ kind: "mention" }), [r]).tags).toEqual([
      "ping",
    ]);
    expect(
      applyInboxRules(makeSignal({ kind: "dm" }), [r]).matched_rule_ids,
    ).toEqual([]);
  });

  it("matches by source_match against payload field", () => {
    const r = makeRule({
      predicates: [
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      effects: [{ type: "auto_dismiss" }],
    });
    const dependabot = makeSignal({ payload: { author: "dependabot" } });
    const human = makeSignal({ payload: { author: "alice" } });
    expect(applyInboxRules(dependabot, [r]).dismissed).toBe(true);
    expect(applyInboxRules(human, [r]).dismissed).toBe(false);
  });

  it("matches by title_regex", () => {
    const r = makeRule({
      predicates: [{ type: "title_regex", pattern: "^chore" }],
      effects: [{ type: "tag", tag: "chore" }],
    });
    expect(
      applyInboxRules(makeSignal({ title: "chore: bump deps" }), [r]).tags,
    ).toEqual(["chore"]);
    expect(
      applyInboxRules(makeSignal({ title: "feat: x" }), [r]).matched_rule_ids,
    ).toEqual([]);
  });

  it("invalid regex never matches", () => {
    const r = makeRule({
      predicates: [{ type: "title_regex", pattern: "(unclosed" }],
      effects: [{ type: "tag", tag: "x" }],
    });
    expect(applyInboxRules(makeSignal(), [r]).matched_rule_ids).toEqual([]);
  });

  it("AND-combines multiple predicates", () => {
    const r = makeRule({
      predicates: [
        { type: "provider", provider: "github" },
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      effects: [{ type: "auto_dismiss" }],
    });
    expect(
      applyInboxRules(makeSignal({ payload: { author: "dependabot" } }), [r])
        .dismissed,
    ).toBe(true);
    expect(
      applyInboxRules(makeSignal({ payload: { author: "alice" } }), [r])
        .dismissed,
    ).toBe(false);
  });
});

describe("applyInboxRules — effects", () => {
  it("auto_dismiss sets dismissed=true", () => {
    const r = makeRule({ effects: [{ type: "auto_dismiss" }] });
    expect(applyInboxRules(makeSignal(), [r]).dismissed).toBe(true);
  });

  it("snooze sets snoozed_until = now + minutes", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const r = makeRule({ effects: [{ type: "snooze", minutes: 60 }] });
    const out = applyInboxRules(makeSignal(), [r], now);
    expect(out.snoozed_until).toBe("2026-05-04T13:00:00.000Z");
  });

  it("snooze with non-positive minutes is a no-op", () => {
    const r = makeRule({ effects: [{ type: "snooze", minutes: 0 }] });
    expect(applyInboxRules(makeSignal(), [r]).snoozed_until).toBeNull();
  });

  it("multiple snoozes pick the latest", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const out = applyInboxRules(
      makeSignal(),
      [
        makeRule({
          id: "a",
          priority: 1,
          effects: [{ type: "snooze", minutes: 30 }],
        }),
        makeRule({
          id: "b",
          priority: 2,
          effects: [{ type: "snooze", minutes: 120 }],
        }),
      ],
      now,
    );
    expect(out.snoozed_until).toBe("2026-05-04T14:00:00.000Z");
  });

  it("priority effect sets priority on the application", () => {
    const r = makeRule({
      effects: [{ type: "priority", value: "high" }],
    });
    expect(applyInboxRules(makeSignal(), [r]).priority).toBe("high");
  });

  it("higher-priority rule wins last on priority effect", () => {
    const out = applyInboxRules(
      makeSignal(),
      [
        makeRule({
          id: "a",
          priority: 1,
          effects: [{ type: "priority", value: "low" }],
        }),
        makeRule({
          id: "b",
          priority: 2,
          effects: [{ type: "priority", value: "high" }],
        }),
      ],
      new Date(),
    );
    expect(out.priority).toBe("high");
  });

  it("priority defaults to null when no rule sets it", () => {
    expect(applyInboxRules(makeSignal(), []).priority).toBeNull();
    const r = makeRule({ effects: [{ type: "tag", tag: "x" }] });
    expect(applyInboxRules(makeSignal(), [r]).priority).toBeNull();
  });

  it("tags accumulate without duplicates", () => {
    const out = applyInboxRules(
      makeSignal(),
      [
        makeRule({
          id: "a",
          priority: 1,
          effects: [{ type: "tag", tag: "x" }],
        }),
        makeRule({
          id: "b",
          priority: 2,
          effects: [{ type: "tag", tag: "y" }],
        }),
        makeRule({
          id: "c",
          priority: 3,
          effects: [{ type: "tag", tag: "x" }],
        }),
      ],
      new Date(),
    );
    expect(out.tags).toEqual(["x", "y"]);
    expect(out.matched_rule_ids).toEqual(["a", "b", "c"]);
  });
});

describe("applyInboxRules — ordering and gating", () => {
  it("respects priority order in matched_rule_ids", () => {
    const out = applyInboxRules(
      makeSignal(),
      [
        makeRule({
          id: "high",
          priority: 200,
          effects: [{ type: "tag", tag: "h" }],
        }),
        makeRule({
          id: "low",
          priority: 1,
          effects: [{ type: "tag", tag: "l" }],
        }),
      ],
      new Date(),
    );
    expect(out.matched_rule_ids).toEqual(["low", "high"]);
    expect(out.tags).toEqual(["l", "h"]);
  });

  it("disabled rules do not fire", () => {
    const r = makeRule({ enabled: false, effects: [{ type: "auto_dismiss" }] });
    expect(applyInboxRules(makeSignal(), [r]).dismissed).toBe(false);
  });

  it("rules with no predicates never fire", () => {
    const r = makeRule({ predicates: [], effects: [{ type: "auto_dismiss" }] });
    expect(applyInboxRules(makeSignal(), [r]).matched_rule_ids).toEqual([]);
  });

  it("integration: dependabot PR lands snoozed", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const r: InboxRule = {
      id: "snooze-dependabot",
      name: "Snooze dependabot",
      enabled: true,
      priority: 1,
      predicates: [
        { type: "provider", provider: "github" },
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      effects: [
        { type: "snooze", minutes: 60 * 24 },
        { type: "tag", tag: "deps" },
      ],
    };
    const out = applyInboxRules(
      makeSignal({ payload: { author: "dependabot", repo: "x/y" } }),
      [r],
      now,
    );
    expect(out.dismissed).toBe(false);
    expect(out.snoozed_until).toBe("2026-05-05T12:00:00.000Z");
    expect(out.tags).toEqual(["deps"]);
    expect(out.matched_rule_ids).toEqual(["snooze-dependabot"]);
  });
});

describe("previewInboxRules", () => {
  it("keeps only signals that any rule fired on, preserving order", () => {
    const rule = makeRule({
      predicates: [
        { type: "source_match", field: "author", equals: "dependabot" },
      ],
      effects: [{ type: "auto_dismiss" }],
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
    const out = previewInboxRules([matched, skipped, matched2], [rule]);
    expect(out.map((r) => r.signal.source_id)).toEqual(["pr-1", "pr-3"]);
    expect(out[0].application.dismissed).toBe(true);
    expect(out[0].application.matched_rule_ids).toEqual(["r-1"]);
  });

  it("returns an empty list when no rule fires", () => {
    const rule = makeRule({
      predicates: [{ type: "kind", kind: "ticket_blocked" }],
      effects: [{ type: "tag", tag: "blocked" }],
    });
    expect(previewInboxRules([makeSignal()], [rule])).toEqual([]);
  });
});

describe("validateInboxRules", () => {
  it("returns no errors for a valid rule list", () => {
    expect(validateInboxRules([])).toEqual([]);
    expect(
      validateInboxRules([
        {
          id: "r-1",
          name: "x",
          enabled: true,
          priority: 1,
          predicates: [{ type: "kind", kind: "mention" }],
          effects: [{ type: "tag", tag: "x" }],
        },
      ]),
    ).toEqual([]);
  });

  it("flags missing fields", () => {
    const errs = validateInboxRules([
      {
        id: "",
        name: "",
        enabled: true,
        priority: Number.NaN,
        predicates: [],
        effects: [],
      } as unknown as InboxRule,
    ]);
    expect(errs.length).toBeGreaterThan(0);
  });

  it("flags duplicate ids", () => {
    const r = {
      id: "x",
      name: "n",
      enabled: true,
      priority: 1,
      predicates: [{ type: "kind" as const, kind: "mention" }],
      effects: [{ type: "tag" as const, tag: "t" }],
    };
    const errs = validateInboxRules([r, { ...r }]);
    expect(errs.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("flags invalid regex predicates", () => {
    const errs = validateInboxRules([
      {
        id: "x",
        name: "n",
        enabled: true,
        priority: 1,
        predicates: [{ type: "title_regex", pattern: "(unclosed" }],
        effects: [{ type: "tag", tag: "t" }],
      },
    ]);
    expect(errs.some((e) => e.includes("invalid regex"))).toBe(true);
  });
});
