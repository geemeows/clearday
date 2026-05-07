import { describe, expect, it, vi } from "vitest";
import {
  type AutomationRunRow,
  type AutomationRunsReader,
  getAutomations,
  listAutomationRuns,
  putAutomations,
  RUNS_PAGE_LIMIT_DEFAULT,
  RUNS_PAGE_LIMIT_MAX,
} from "#/features/automations/api";
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

function runRow(overrides: Partial<AutomationRunRow> = {}): AutomationRunRow {
  return {
    id: overrides.id ?? "r-1",
    automation_id: overrides.automation_id ?? "a-1",
    trigger_event_id: overrides.trigger_event_id ?? "evt-1",
    signal_id: overrides.signal_id ?? null,
    status: overrides.status ?? "succeeded",
    actions_planned: overrides.actions_planned ?? [],
    actions_executed: overrides.actions_executed ?? [],
    error: overrides.error ?? null,
    started_at: overrides.started_at ?? "2026-05-07T12:00:00.000Z",
    finished_at: overrides.finished_at ?? "2026-05-07T12:00:01.000Z",
  };
}

function runsReader(rows: AutomationRunRow[]): AutomationRunsReader & {
  listForAutomation: ReturnType<typeof vi.fn>;
} {
  return {
    listForAutomation: vi.fn(
      async (id: string, opts: { limit: number; before?: string }) => {
        const filtered = rows
          .filter((r) => r.automation_id === id)
          .filter((r) =>
            opts.before === undefined ? true : r.started_at < opts.before,
          )
          .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
          .slice(0, opts.limit);
        return filtered;
      },
    ),
  };
}

describe("listAutomationRuns", () => {
  it("rejects an empty automation id", async () => {
    const reader = runsReader([]);
    expect(await listAutomationRuns("", reader)).toMatchObject({ ok: false });
  });

  it("rejects a non-ISO before cursor", async () => {
    const reader = runsReader([]);
    expect(
      await listAutomationRuns("a-1", reader, { before: "not-a-date" }),
    ).toMatchObject({ ok: false });
  });

  it("uses the default limit when none is supplied", async () => {
    const reader = runsReader([]);
    await listAutomationRuns("a-1", reader);
    expect(reader.listForAutomation).toHaveBeenCalledWith("a-1", {
      limit: RUNS_PAGE_LIMIT_DEFAULT,
      before: undefined,
    });
  });

  it("clamps the limit to the maximum and rejects nonsense", async () => {
    const reader = runsReader([]);
    await listAutomationRuns("a-1", reader, { limit: 9999 });
    expect(reader.listForAutomation).toHaveBeenLastCalledWith("a-1", {
      limit: RUNS_PAGE_LIMIT_MAX,
      before: undefined,
    });
    await listAutomationRuns("a-1", reader, { limit: -5 });
    expect(reader.listForAutomation).toHaveBeenLastCalledWith("a-1", {
      limit: RUNS_PAGE_LIMIT_DEFAULT,
      before: undefined,
    });
  });

  it("returns runs newest first and a next_cursor when the page is full", async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      runRow({
        id: `r-${i}`,
        started_at: `2026-05-${String(7 - (i % 7)).padStart(
          2,
          "0",
        )}T0${i % 9}:00:00.000Z`,
      }),
    );
    const reader = runsReader(rows);
    const out = await listAutomationRuns("a-1", reader, { limit: 10 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.runs).toHaveLength(10);
    expect(out.next_cursor).toBe(out.runs[9]?.started_at ?? null);
  });

  it("returns next_cursor=null when the page is partial", async () => {
    const reader = runsReader([
      runRow({ id: "r-1", started_at: "2026-05-07T10:00:00.000Z" }),
      runRow({ id: "r-2", started_at: "2026-05-06T10:00:00.000Z" }),
    ]);
    const out = await listAutomationRuns("a-1", reader, { limit: 10 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.runs).toHaveLength(2);
    expect(out.next_cursor).toBeNull();
  });

  it("forwards before to the reader for cursor pagination", async () => {
    const reader = runsReader([
      runRow({ id: "r-1", started_at: "2026-05-07T10:00:00.000Z" }),
      runRow({ id: "r-2", started_at: "2026-05-06T10:00:00.000Z" }),
    ]);
    const out = await listAutomationRuns("a-1", reader, {
      before: "2026-05-07T00:00:00.000Z",
      limit: 10,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.runs.map((r) => r.id)).toEqual(["r-2"]);
  });
});
