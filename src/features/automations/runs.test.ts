import { describe, expect, it, vi } from "vitest";
import { listRuns, type RunsQueryClient } from "#/features/automations/runs";
import type { AutomationRunRow } from "#/features/automations/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<AutomationRunRow> = {}): AutomationRunRow {
  return {
    id: "r-1",
    automation_id: "a-1",
    trigger_event_id: "signal:s_001",
    signal_id: "s_001",
    status: "succeeded",
    actions_planned: [],
    actions_executed: [],
    error: null,
    started_at: "2026-05-14T10:00:00Z",
    finished_at: "2026-05-14T10:00:01Z",
    ...overrides,
  };
}

function makeClient(
  rows: AutomationRunRow[],
  err?: { message: string },
): { client: RunsQueryClient; chain: Record<string, ReturnType<typeof vi.fn>> } {
  const terminalResult = { data: err ? null : rows, error: err ?? null };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    lt: vi.fn(),
    limit: vi.fn().mockResolvedValue(terminalResult),
    is: vi.fn(),
    in: vi.fn(),
    ilike: vi.fn(),
    or: vi.fn(),
    gte: vi.fn(),
  };
  for (const key of ["select", "eq", "order", "lt", "is", "in", "ilike", "or", "gte"]) {
    chain[key]!.mockReturnValue(chain);
  }
  const client: RunsQueryClient = {
    from: vi.fn().mockReturnValue({ select: chain.select }),
  };
  return { client, chain };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("listRuns", () => {
  it("returns rows for the given automation", async () => {
    const run = makeRun();
    const { client } = makeClient([run]);
    const result = await listRuns(client, "a-1");
    expect(result).toEqual([run]);
  });

  it("queries the automation_runs table", async () => {
    const { client } = makeClient([]);
    await listRuns(client, "a-1");
    expect(client.from).toHaveBeenCalledWith("automation_runs");
  });

  it("filters by automation_id (join correctness)", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-99");
    expect(chain.eq).toHaveBeenCalledWith("automation_id", "a-99");
  });

  it("orders by started_at descending (newest first)", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1");
    expect(chain.order).toHaveBeenCalledWith("started_at", { ascending: false });
  });

  it("defaults to limit 25", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1");
    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it("respects custom limit", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1", { limit: 5 });
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it("clamps limit to 100", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1", { limit: 999 });
    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  it("applies before cursor when provided", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1", { before: "2026-05-13T00:00:00Z" });
    expect(chain.lt).toHaveBeenCalledWith("started_at", "2026-05-13T00:00:00Z");
  });

  it("does not apply lt filter when before is absent", async () => {
    const { client, chain } = makeClient([]);
    await listRuns(client, "a-1");
    expect(chain.lt).not.toHaveBeenCalled();
  });

  it("returns empty array when no rows", async () => {
    const { client } = makeClient([]);
    expect(await listRuns(client, "a-1")).toEqual([]);
  });

  it("throws on query error", async () => {
    const { client } = makeClient([], { message: "permission denied" });
    await expect(listRuns(client, "a-1")).rejects.toThrow(
      "automation runs query failed: permission denied",
    );
  });

  it("returned rows carry the automation_id (join field present)", async () => {
    const run = makeRun({ automation_id: "a-42" });
    const { client } = makeClient([run]);
    const rows = await listRuns(client, "a-42");
    expect(rows[0]?.automation_id).toBe("a-42");
  });
});
