// Read/write boundary for Tasks (Redesign v4 / Slice 4, issue #172).
//
// Tracer-bullet scope: read path + status transition + link-PR + create +
// delete + assign mutations. Row shape matches `Task` from
// `src/routes/_app.tasks.tsx` so the route swaps `FIXTURE_TASKS` for
// `listTasks()` mechanically. `setTaskAssignee` ships as the store boundary
// only — the route UI affordance lands once an assign affordance is spec'd.

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

export async function updateTaskStatus(
  client: SupabaseLike,
  id: string,
  status: TaskStatus,
): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update({ status } as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`task status update failed: ${error.message}`);
}

export async function createTask(
  client: SupabaseLike,
  task: Task,
): Promise<void> {
  const { error } = await client.from("tasks").upsert(
    {
      id: task.id,
      title: task.title,
      priority: task.p,
      status: task.status,
      days: task.days,
      pr: task.pr,
      labels: task.labels,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`task create failed: ${error.message}`);
}

export async function linkTaskPr(
  client: SupabaseLike,
  id: string,
  pr: string | null,
): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update({ pr } as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`task pr link failed: ${error.message}`);
}

export async function setTaskAssignee(
  client: SupabaseLike,
  id: string,
  assignee: string | null,
): Promise<void> {
  const { error } = await client
    .from("tasks")
    .update({ assignee } as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`task assignee update failed: ${error.message}`);
}

export async function deleteTask(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const del = client.from("tasks").delete;
  if (!del) throw new Error("task delete failed: client missing delete()");
  const { error } = await del().eq("id", id);
  if (error) throw new Error(`task delete failed: ${error.message}`);
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
