import { describe, expect, it, vi } from "vitest";
import { listTasks } from "#/features/tasks/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(overrides: {
  data?: Record<string, unknown>[];
  error?: { message: string } | null;
}) {
  const limit = vi.fn(async () => ({
    data: overrides.data ?? [],
    error: overrides.error ?? null,
  }));
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order, limit, eq: vi.fn(), in: vi.fn() }));
  const upsert = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const from = vi.fn(() => ({ select, upsert, update }));
  const client = { from } as unknown as SupabaseLike;
  return { client, spies: { from, select, order, limit } };
}

describe("listTasks", () => {
  it("maps stored rows to the Task shape consumed by the route", async () => {
    const { client } = makeClient({
      data: [
        {
          id: "DEV-441",
          title: "Add timestamp-replay rejection",
          priority: "P1",
          status: "in_progress",
          days: 1,
          pr: "#421",
          labels: ["security"],
          created_at: "2026-05-12T00:00:00Z",
        },
        {
          id: "DEV-401",
          title: "Signal-store upsert benchmarks",
          priority: "P3",
          status: "in_progress",
          days: 6,
          pr: null,
          labels: ["perf"],
          created_at: "2026-05-12T01:00:00Z",
        },
      ],
    });
    const tasks = await listTasks(client);
    expect(tasks).toEqual([
      {
        id: "DEV-441",
        title: "Add timestamp-replay rejection",
        p: "P1",
        status: "in_progress",
        days: 1,
        pr: "#421",
        labels: ["security"],
      },
      {
        id: "DEV-401",
        title: "Signal-store upsert benchmarks",
        p: "P3",
        status: "in_progress",
        days: 6,
        pr: null,
        labels: ["perf"],
      },
    ]);
  });

  it("returns an empty array when no rows exist", async () => {
    const { client } = makeClient({ data: [] });
    expect(await listTasks(client)).toEqual([]);
  });

  it("throws when the underlying query errors", async () => {
    const { client } = makeClient({ error: { message: "rls denied" } });
    await expect(listTasks(client)).rejects.toThrow(/rls denied/);
  });

  it("queries the tasks table ordered by created_at", async () => {
    const { client, spies } = makeClient({ data: [] });
    await listTasks(client);
    expect(spies.from).toHaveBeenCalledWith("tasks");
    expect(spies.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });
});
