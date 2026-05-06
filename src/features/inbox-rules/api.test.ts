import { describe, expect, it, vi } from "vitest";
import { getInboxRules, putInboxRules } from "#/features/inbox-rules/api";
import type { InboxRule } from "#/features/inbox-rules/engine";

function memoryStore(initial: InboxRule[] = []) {
  let rules = initial;
  return {
    load: vi.fn(async () => rules),
    save: vi.fn(async (next: InboxRule[]) => {
      rules = next;
      return rules;
    }),
  };
}

const validRule: InboxRule = {
  id: "r-1",
  name: "snooze deps",
  enabled: true,
  priority: 1,
  predicates: [{ type: "source_match", field: "author", equals: "dependabot" }],
  effects: [{ type: "snooze", minutes: 60 }],
};

describe("getInboxRules", () => {
  it("returns the loaded rules", async () => {
    const store = memoryStore([validRule]);
    expect(await getInboxRules(store)).toEqual({ rules: [validRule] });
  });
});

describe("putInboxRules", () => {
  it("rejects non-object body", async () => {
    const out = await putInboxRules(null, memoryStore());
    expect(out).toMatchObject({ ok: false });
  });

  it("rejects when rules isn't an array", async () => {
    const out = await putInboxRules({ rules: "x" }, memoryStore());
    expect(out).toMatchObject({ ok: false });
  });

  it("rejects malformed rules", async () => {
    const bad = { ...validRule, predicates: [] };
    const out = await putInboxRules({ rules: [bad] }, memoryStore());
    expect(out).toMatchObject({ ok: false });
  });

  it("saves valid rules and returns the saved list", async () => {
    const store = memoryStore();
    const out = await putInboxRules({ rules: [validRule] }, store);
    expect(out).toEqual({ ok: true, rules: [validRule] });
    expect(store.save).toHaveBeenCalledWith([validRule]);
  });

  it("rejects rules with invalid regex", async () => {
    const bad: InboxRule = {
      ...validRule,
      predicates: [{ type: "title_regex", pattern: "(unclosed" }],
    };
    const out = await putInboxRules({ rules: [bad] }, memoryStore());
    expect(out).toMatchObject({ ok: false });
  });
});
