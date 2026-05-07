import { describe, expect, it, vi } from "vitest";
import { getAutomations, putAutomations } from "#/features/automations/api";
import type { Automation } from "#/features/automations/engine";

function memoryStore(initial: Automation[] = []) {
  let automations = initial;
  return {
    load: vi.fn(async () => automations),
    save: vi.fn(async (next: Automation[]) => {
      automations = next;
      return automations;
    }),
  };
}

const valid: Automation = {
  id: "a-1",
  name: "snooze deps",
  enabled: true,
  priority: 1,
  trigger_kind: "signal_ingested",
  predicates: [{ type: "source_match", field: "author", equals: "dependabot" }],
  actions: [{ type: "snooze", minutes: 60 }],
};

describe("getAutomations", () => {
  it("returns the loaded automations", async () => {
    const store = memoryStore([valid]);
    expect(await getAutomations(store)).toEqual({ automations: [valid] });
  });
});

describe("putAutomations", () => {
  it("rejects non-object body", async () => {
    expect(await putAutomations(null, memoryStore())).toMatchObject({
      ok: false,
    });
  });

  it("rejects when automations isn't an array", async () => {
    expect(
      await putAutomations({ automations: "x" }, memoryStore()),
    ).toMatchObject({ ok: false });
  });

  it("rejects malformed automations", async () => {
    const bad = { ...valid, predicates: [] };
    expect(
      await putAutomations({ automations: [bad] }, memoryStore()),
    ).toMatchObject({ ok: false });
  });

  it("saves valid automations and returns the saved list", async () => {
    const store = memoryStore();
    const out = await putAutomations({ automations: [valid] }, store);
    expect(out).toEqual({ ok: true, automations: [valid] });
    expect(store.save).toHaveBeenCalledWith([valid]);
  });

  it("rejects automations with invalid regex", async () => {
    const bad: Automation = {
      ...valid,
      predicates: [{ type: "title_regex", pattern: "(unclosed" }],
    };
    const out = await putAutomations({ automations: [bad] }, memoryStore());
    expect(out).toMatchObject({ ok: false });
  });

  it("rejects unknown trigger_kind", async () => {
    const bad = {
      ...valid,
      trigger_kind: "schedule",
    } as unknown as Automation;
    expect(
      await putAutomations({ automations: [bad] }, memoryStore()),
    ).toMatchObject({ ok: false });
  });

  it("rejects unknown action type", async () => {
    const bad = {
      ...valid,
      actions: [{ type: "post_message" }],
    } as unknown as Automation;
    expect(
      await putAutomations({ automations: [bad] }, memoryStore()),
    ).toMatchObject({ ok: false });
  });
});
