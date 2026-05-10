// Read/write boundary for the Career feature. Adds the first tree layer
// (competencies) on top of the level seam. Criteria / indicators / evidence
// follow in subsequent slices and reuse the same inline-rename + soft-delete
// pattern proven here.
//
// Mirrors features/projects/store.ts — thin SupabaseLike client so tests can
// drive it without the SDK; RLS gates access to the allowed user.

import type { SupabaseLike } from "#/shared/db";

export type LevelStatus = "active" | "archived";

export type StoredLevel = {
  id: string;
  title: string;
  status: LevelStatus;
  header: Array<{ key: string; value: string }>;
  sheet_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  archived_at: string | null;
};

export type StoredCompetency = {
  id: string;
  level_id: string;
  name: string;
  position: number;
  created_at: string;
  deleted_at: string | null;
};

export async function createLevel(
  client: SupabaseLike,
  level: { id: string; title: string },
): Promise<void> {
  const { error } = await client
    .from("career_levels")
    .upsert(
      { id: level.id, title: level.title, status: "active" },
      { onConflict: "id" },
    );
  if (error) throw new Error(`career level create failed: ${error.message}`);
}

export async function listLevels(
  client: SupabaseLike,
): Promise<StoredLevel[]> {
  const { data, error } = await client
    .from("career_levels")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`career level list failed: ${error.message}`);
  return (data ?? []) as StoredLevel[];
}

export async function getActiveLevel(
  client: SupabaseLike,
): Promise<StoredLevel | null> {
  const { data, error } = await client
    .from("career_levels")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`career active level fetch failed: ${error.message}`);
  const rows = (data ?? []) as StoredLevel[];
  return rows[0] ?? null;
}

// ─── Competencies ────────────────────────────────────────────────────────────

export async function createCompetency(
  client: SupabaseLike,
  competency: {
    id: string;
    level_id: string;
    name: string;
    position: number;
  },
): Promise<void> {
  const { error } = await client.from("career_competencies").upsert(
    {
      id: competency.id,
      level_id: competency.level_id,
      name: competency.name,
      position: competency.position,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`competency create failed: ${error.message}`);
}

// Lists non-soft-deleted competencies for a level, ordered by position.
export async function listCompetencies(
  client: SupabaseLike,
  levelId: string,
): Promise<StoredCompetency[]> {
  const { data, error } = await client
    .from("career_competencies")
    .select("*")
    .eq("level_id", levelId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`competency list failed: ${error.message}`);
  return (data ?? []) as StoredCompetency[];
}

export async function renameCompetency(
  client: SupabaseLike,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from("career_competencies")
    .update({ name })
    .eq("id", id);
  if (error) throw new Error(`competency rename failed: ${error.message}`);
}

// Soft-delete: stamps deleted_at. Cascade-hide of children is handled by the
// child list queries (each level filters `deleted_at is null`).
export async function softDeleteCompetency(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("career_competencies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`competency delete failed: ${error.message}`);
}
