// Read/write boundary for the Career feature. Tracer slice — exposes only the
// surface needed to land an active-level page: list levels, fetch the active
// one, create a new level. Tree-row CRUD (competencies / criteria / indicators
// / evidence) is parked for the next slice.
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
