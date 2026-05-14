import { describe, expect, it } from "vitest";
import {
  type InboxRule,
  type InboxRulesStore,
  type NewInboxRule,
  createInboxRule,
  deleteInboxRule,
  listInboxRules,
  patchInboxRule,
} from "./api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<InboxRule> = {}): InboxRule {
  return {
    id: "rule-1",
    name: "Test rule",
    match_all: true,
    conditions: [{ field: "author", op: "is", value: "dependabot" }],
    action: "snooze",
    action_param: "1d",
    enabled: true,
    hits_30d: 0,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeStore(rules: InboxRule[] = []): InboxRulesStore {
  const store = [...rules];
  return {
    list: async () => [...store],
    create: async (rule: NewInboxRule) => {
      const created = { ...rule, id: "new-id", hits_30d: 0, created_at: "2024-01-01T00:00:00Z" };
      store.push(created);
      return created;
    },
    patch: async (id, patch) => {
      const i = store.findIndex((r) => r.id === id);
      if (i === -1) return null;
      store[i] = { ...store[i], ...patch } as InboxRule;
      return store[i];
    },
    delete: async (id) => {
      const i = store.findIndex((r) => r.id === id);
      if (i === -1) return false;
      store.splice(i, 1);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// listInboxRules
// ---------------------------------------------------------------------------

describe("listInboxRules", () => {
  it("returns empty array when store is empty", async () => {
    const result = await listInboxRules(makeStore());
    expect(result.rules).toEqual([]);
  });

  it("returns all rules", async () => {
    const rule = makeRule();
    const result = await listInboxRules(makeStore([rule]));
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].id).toBe("rule-1");
  });
});

// ---------------------------------------------------------------------------
// createInboxRule
// ---------------------------------------------------------------------------

describe("createInboxRule", () => {
  it("creates a rule from a valid body", async () => {
    const store = makeStore();
    const result = await createInboxRule(
      { action: "dismiss", name: "No-agenda meetings", conditions: [] },
      store,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.rule.action).toBe("dismiss");
    expect(result.rule.name).toBe("No-agenda meetings");
  });

  it("defaults match_all to true and enabled to true", async () => {
    const store = makeStore();
    const result = await createInboxRule({ action: "low" }, store);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.rule.match_all).toBe(true);
    expect(result.rule.enabled).toBe(true);
  });

  it("rejects body without action", async () => {
    const result = await createInboxRule({ name: "bad" }, makeStore());
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects non-object body", async () => {
    const result = await createInboxRule("string", makeStore());
    expect(result).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// patchInboxRule
// ---------------------------------------------------------------------------

describe("patchInboxRule", () => {
  it("patches enabled field", async () => {
    const store = makeStore([makeRule({ enabled: true })]);
    const result = await patchInboxRule("rule-1", { enabled: false }, store);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.rule.enabled).toBe(false);
  });

  it("returns error for missing id", async () => {
    const result = await patchInboxRule("", { enabled: false }, makeStore());
    expect(result).toMatchObject({ ok: false, error: "id required" });
  });

  it("returns not found when rule does not exist", async () => {
    const result = await patchInboxRule("ghost", { enabled: false }, makeStore());
    expect(result).toMatchObject({ ok: false, error: "rule not found" });
  });

  it("rejects empty patch", async () => {
    const store = makeStore([makeRule()]);
    const result = await patchInboxRule("rule-1", {}, store);
    expect(result).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// deleteInboxRule
// ---------------------------------------------------------------------------

describe("deleteInboxRule", () => {
  it("deletes an existing rule", async () => {
    const store = makeStore([makeRule()]);
    const result = await deleteInboxRule("rule-1", store);
    expect(result).toMatchObject({ ok: true });
  });

  it("returns error for missing id", async () => {
    const result = await deleteInboxRule("", makeStore());
    expect(result).toMatchObject({ ok: false, error: "id required" });
  });

  it("returns not found for unknown id", async () => {
    const result = await deleteInboxRule("ghost", makeStore());
    expect(result).toMatchObject({ ok: false, error: "rule not found" });
  });
});
