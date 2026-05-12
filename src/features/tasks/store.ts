// Read/write boundary for Tasks (Redesign v4 / Slice 4, issue #172).
//
// Tracer-bullet scope: only the read path consumed by `_app.tasks` lands here.
// Row shape matches `Task` from `src/routes/_app.tasks.tsx` so the route can
// swap `FIXTURE_TASKS` for `listTasks()` mechanically. Mutations land in a
// follow-up.

import type { Task, TaskPriority, TaskStatus } from "#/routes/_app.tasks";
import type { SupabaseLike } from "#/shared/db";

export type StoredTask = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  days: number;
  pr: string | null;
  labels: string[];
  created_at: string;
};

export async function listTasks(client: SupabaseLike): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`task list failed: ${error.message}`);
  return ((data ?? []) as StoredTask[]).map(toTask);
}

function toTask(row: StoredTask): Task {
  return {
    id: row.id,
    title: row.title,
    p: row.priority,
    status: row.status,
    days: row.days,
    pr: row.pr,
    labels: row.labels,
  };
}
