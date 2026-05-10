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

export type StoredCriterion = {
  id: string;
  competency_id: string;
  name: string;
  target: number;
  position: number;
  created_at: string;
  deleted_at: string | null;
};

export type StoredIndicator = {
  id: string;
  criterion_id: string;
  code: string | null;
  description: string;
  notes: string | null;
  score: number;
  position: number;
  created_at: string;
  deleted_at: string | null;
};

export type StoredEvidence = {
  id: string;
  indicator_id: string;
  title: string;
  url: string | null;
  note: string | null;
  card_id: string | null;
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

// ─── Criteria ────────────────────────────────────────────────────────────────

export async function createCriterion(
  client: SupabaseLike,
  criterion: {
    id: string;
    competency_id: string;
    name: string;
    target: number;
    position: number;
  },
): Promise<void> {
  const { error } = await client.from("career_criteria").upsert(
    {
      id: criterion.id,
      competency_id: criterion.competency_id,
      name: criterion.name,
      target: criterion.target,
      position: criterion.position,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`criterion create failed: ${error.message}`);
}

export async function listCriteria(
  client: SupabaseLike,
  competencyId: string,
): Promise<StoredCriterion[]> {
  const { data, error } = await client
    .from("career_criteria")
    .select("*")
    .eq("competency_id", competencyId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`criterion list failed: ${error.message}`);
  return (data ?? []) as StoredCriterion[];
}

export async function renameCriterion(
  client: SupabaseLike,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await client
    .from("career_criteria")
    .update({ name })
    .eq("id", id);
  if (error) throw new Error(`criterion rename failed: ${error.message}`);
}

export async function setCriterionTarget(
  client: SupabaseLike,
  id: string,
  target: number,
): Promise<void> {
  const { error } = await client
    .from("career_criteria")
    .update({ target })
    .eq("id", id);
  if (error) throw new Error(`criterion target update failed: ${error.message}`);
}

export async function softDeleteCriterion(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("career_criteria")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`criterion delete failed: ${error.message}`);
}

// ─── Indicators ──────────────────────────────────────────────────────────────

// score defaults to 1 (the new 1–4 floor from migration 0029).
export async function createIndicator(
  client: SupabaseLike,
  indicator: {
    id: string;
    criterion_id: string;
    code?: string | null;
    description: string;
    notes?: string | null;
    position: number;
  },
): Promise<void> {
  const { error } = await client.from("career_indicators").upsert(
    {
      id: indicator.id,
      criterion_id: indicator.criterion_id,
      code: indicator.code ?? null,
      description: indicator.description,
      notes: indicator.notes ?? null,
      score: 1,
      position: indicator.position,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`indicator create failed: ${error.message}`);
}

export async function listIndicators(
  client: SupabaseLike,
  criterionId: string,
): Promise<StoredIndicator[]> {
  const { data, error } = await client
    .from("career_indicators")
    .select("*")
    .eq("criterion_id", criterionId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`indicator list failed: ${error.message}`);
  return (data ?? []) as StoredIndicator[];
}

export async function renameIndicator(
  client: SupabaseLike,
  id: string,
  fields: { code?: string | null; description?: string; notes?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.code !== undefined) update.code = fields.code;
  if (fields.description !== undefined) update.description = fields.description;
  if (fields.notes !== undefined) update.notes = fields.notes;
  const { error } = await client
    .from("career_indicators")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(`indicator rename failed: ${error.message}`);
}

export async function setIndicatorScore(
  client: SupabaseLike,
  id: string,
  score: number,
): Promise<void> {
  const { error } = await client
    .from("career_indicators")
    .update({ score })
    .eq("id", id);
  if (error) throw new Error(`indicator score update failed: ${error.message}`);
}

export async function softDeleteIndicator(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("career_indicators")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`indicator delete failed: ${error.message}`);
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export async function createEvidence(
  client: SupabaseLike,
  evidence: {
    id: string;
    indicator_id: string;
    title: string;
    url?: string | null;
    note?: string | null;
    card_id?: string | null;
    position: number;
  },
): Promise<void> {
  const { error } = await client.from("career_evidence").upsert(
    {
      id: evidence.id,
      indicator_id: evidence.indicator_id,
      title: evidence.title,
      url: evidence.url ?? null,
      note: evidence.note ?? null,
      card_id: evidence.card_id ?? null,
      position: evidence.position,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`evidence create failed: ${error.message}`);
}

export async function listEvidence(
  client: SupabaseLike,
  indicatorId: string,
): Promise<StoredEvidence[]> {
  const { data, error } = await client
    .from("career_evidence")
    .select("*")
    .eq("indicator_id", indicatorId)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(200);
  if (error) throw new Error(`evidence list failed: ${error.message}`);
  return (data ?? []) as StoredEvidence[];
}

// Partial update over title / url / note / card_id — all autosave on blur, and
// only the dirty field needs to write. Mirrors renameIndicator.
export async function updateEvidence(
  client: SupabaseLike,
  id: string,
  fields: {
    title?: string;
    url?: string | null;
    note?: string | null;
    card_id?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (fields.title !== undefined) update.title = fields.title;
  if (fields.url !== undefined) update.url = fields.url;
  if (fields.note !== undefined) update.note = fields.note;
  if (fields.card_id !== undefined) update.card_id = fields.card_id;
  const { error } = await client
    .from("career_evidence")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(`evidence update failed: ${error.message}`);
}

export async function softDeleteEvidence(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const { error } = await client
    .from("career_evidence")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`evidence delete failed: ${error.message}`);
}

// Picker support: simple title-prefix search over project_cards. Read-only —
// the picker never creates cards.
export async function searchProjectCards(
  client: SupabaseLike,
  query: string,
): Promise<Array<{ id: string; title: string }>> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await client
    .from("project_cards")
    .select("id,title")
    .ilike("title", `%${trimmed}%`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`card search failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; title: string }>;
}
