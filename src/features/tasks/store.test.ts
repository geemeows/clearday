import { describe, expect, it, vi } from "vitest";
import { linkTaskPr, listTasks, updateTaskStatus } from "#/features/tasks/store";
import type { SupabaseLike } from "#/shared/db";

function makeClient(overrides: {
  data?: Record<string, unknown>[];
  error?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const limit = vi.fn(async () => ({
    data: overrides.data ?? [],
    error: overrides.error ?? null,
  }));
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order, limit, eq: vi.fn(), in: vi.fn() }));
  const upsert = vi.fn(async () => ({ error: null }));
  const updateEq = vi.fn(async () => ({
    error: overrides.updateError ?? null,
  }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, upsert, update }));
  const client = { from } as unknown as SupabaseLike;
  return { client, spies: { from, select, order, limit, update, updateEq } };
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

describe("updateTaskStatus", () => {
  it("updates the task row matching the given id with the new status", async () => {
    const { client, spies } = makeClient({});
    await updateTaskStatus(client, "DEV-441", "done");
    expect(spies.from).toHaveBeenCalledWith("tasks");
    expect(spies.update).toHaveBeenCalledWith({ status: "done" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "DEV-441");
  });

  it("throws when the update errors", async () => {
    const { client } = makeClient({ updateError: { message: "rls denied" } });
    await expect(
      updateTaskStatus(client, "DEV-441", "review"),
    ).rejects.toThrow(/rls denied/);
  });
});

describe("linkTaskPr", () => {
  it("updates the task row matching the given id with the new pr", async () => {
    const { client, spies } = makeClient({});
    await linkTaskPr(client, "DEV-441", "#421");
    expect(spies.from).toHaveBeenCalledWith("tasks");
    expect(spies.update).toHaveBeenCalledWith({ pr: "#421" });
    expect(spies.updateEq).toHaveBeenCalledWith("id", "DEV-441");
  });

  it("clears the pr link when passed null", async () => {
    const { client, spies } = makeClient({});
    await linkTaskPr(client, "DEV-441", null);
    expect(spies.update).toHaveBeenCalledWith({ pr: null });
  });

  it("throws when the update errors", async () => {
    const { client } = makeClient({ updateError: { message: "rls denied" } });
    await expect(linkTaskPr(client, "DEV-441", "#421")).rejects.toThrow(
      /rls denied/,
    );
  });
});
