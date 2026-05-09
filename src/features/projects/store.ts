// Read/write boundary for Projects. Hides the Supabase row shapes from callers.
// Takes a thin SupabaseLike client so tests can drive it without the full SDK.
// In SPA context the session-scoped anon client is used; RLS gates all access
// to the allowed user.

import type { SupabaseLike } from "#/shared/db";

export type StoredProject = {
  id: string;
  name: string;
  archived: boolean;
  created_at: string;
};

export type StoredColumn = {
  id: string;
  project_id: string;
  name: string;
  order: number;
  wip_limit: number | null;
};

export type StoredCard = {
  id: string;
  project_id: string;
  column_id: string;
  order: number;
  title: string;
  body: string | null;
  priority: string | null;
  tags: string[];
  due_at: string | null;
  created_at: string;
};

export async function createProject(
  client: SupabaseLike,
  project: { id: string; name: string },
): Promise<void> {
  const { error } = await client
    .from("projects")
    .upsert({ id: project.id, name: project.name }, { onConflict: "id" });
  if (error) throw new Error(`project create failed: ${error.message}`);
}

export async function listProjects(
  client: SupabaseLike,
): Promise<StoredProject[]> {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .eq("archived", "false")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`project list failed: ${error.message}`);
  return (data ?? []) as StoredProject[];
}

export async function createColumn(
  client: SupabaseLike,
  column: { id: string; project_id: string; name: string; order: number },
): Promise<void> {
  const { error } = await client.from("project_columns").upsert(
    {
      id: column.id,
      project_id: column.project_id,
      name: column.name,
      order: column.order,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`column create failed: ${error.message}`);
}

export async function listColumns(
  client: SupabaseLike,
  projectId: string,
): Promise<StoredColumn[]> {
  const { data, error } = await client
    .from("project_columns")
    .select("*")
    .eq("project_id", projectId)
    .order("order", { ascending: true })
    .limit(200);
  if (error) throw new Error(`column list failed: ${error.message}`);
  return (data ?? []) as StoredColumn[];
}

export async function createCard(
  client: SupabaseLike,
  card: {
    id: string;
    project_id: string;
    column_id: string;
    order: number;
    title: string;
  },
): Promise<void> {
  const { error } = await client.from("project_cards").upsert(
    {
      id: card.id,
      project_id: card.project_id,
      column_id: card.column_id,
      order: card.order,
      title: card.title,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`card create failed: ${error.message}`);
}

export type CardPatch = {
  title?: string;
  body?: string | null;
  column_id?: string;
  order?: number;
  priority?: string | null;
  tags?: string[];
  due_at?: string | null;
};

export async function updateCard(
  client: SupabaseLike,
  id: string,
  patch: CardPatch,
): Promise<void> {
  const { error } = await client
    .from("project_cards")
    .update(patch as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`card update failed: ${error.message}`);
}

export async function deleteCard(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const del = client.from("project_cards").delete;
  if (!del) throw new Error("card delete failed: client missing delete()");
  const { error } = await del().eq("id", id);
  if (error) throw new Error(`card delete failed: ${error.message}`);
}

export async function listCards(
  client: SupabaseLike,
  projectId: string,
): Promise<StoredCard[]> {
  const { data, error } = await client
    .from("project_cards")
    .select("*")
    .eq("project_id", projectId)
    .order("order", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`card list failed: ${error.message}`);
  return (data ?? []) as StoredCard[];
}
