import { describe, expect, it } from "vitest";
import {
  type Automation,
  validateAutomations,
} from "#/features/automations/engine";
import { AUTOMATION_TEMPLATES } from "#/features/automations/templates";

describe("AUTOMATION_TEMPLATES", () => {
  it("ships six fixture templates spanning every trigger kind", () => {
    expect(AUTOMATION_TEMPLATES).toHaveLength(6);
    const kinds = new Set(
      AUTOMATION_TEMPLATES.map((t) => t.automation.trigger_kind),
    );
    expect(kinds.has("signal_ingested")).toBe(true);
    expect(kinds.has("signal_state_change")).toBe(true);
    expect(kinds.has("focus_ended")).toBe(true);
    expect(kinds.has("schedule")).toBe(true);
  });

  it("each template has unique id, non-empty description, and at least one action", () => {
    const ids = new Set<string>();
    for (const tpl of AUTOMATION_TEMPLATES) {
      expect(tpl.id.length).toBeGreaterThan(0);
      expect(ids.has(tpl.id)).toBe(false);
      ids.add(tpl.id);
      expect(tpl.description.length).toBeGreaterThan(0);
      expect(tpl.automation.actions.length).toBeGreaterThan(0);
    }
  });

  it("every template clones cleanly into a valid Automation", () => {
    const cloned: Automation[] = AUTOMATION_TEMPLATES.map((tpl, i) => ({
      ...tpl.automation,
      id: `tpl-${i}`,
    }));
    expect(validateAutomations(cloned)).toEqual([]);
  });
});
