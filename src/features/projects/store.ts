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

export type ColumnPatch = {
  name?: string;
  wip_limit?: number | null;
  order?: number;
};

export async function updateColumn(
  client: SupabaseLike,
  id: string,
  patch: ColumnPatch,
): Promise<void> {
  const { error } = await client
    .from("project_columns")
    .update(patch as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`column update failed: ${error.message}`);
}

export async function deleteColumn(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const del = client.from("project_columns").delete;
  if (!del) throw new Error("column delete failed: client missing delete()");
  const { error } = await del().eq("id", id);
  if (error) throw new Error(`column delete failed: ${error.message}`);
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

export type DueCard = StoredCard & { project_name: string };

export type CardWithProject = StoredCard & { project_name: string };

export async function listAllCards(
  client: SupabaseLike,
): Promise<CardWithProject[]> {
  const projects = await listProjects(client);
  if (projects.length === 0) return [];
  const byProject = await Promise.all(
    projects.map((p) =>
      listCards(client, p.id).then((cards) =>
        cards.map((c) => ({ ...c, project_name: p.name })),
      ),
    ),
  );
  return byProject.flat();
}

// ─── Signal links ─────────────────────────────────────────────────────────────

export type StoredCardSignal = {
  id: string;
  card_id: string;
  project_id: string;
  // null when the linked signal was hard-deleted (tombstone state).
  signal_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

// Link a signal to a card. If the signal is already linked to a different card,
// the link moves to the new card (move semantics via ON CONFLICT signal_id).
// Linking to the same card is a no-op.
export async function linkSignalToCard(
  client: SupabaseLike,
  signalId: string,
  cardId: string,
  projectId: string,
): Promise<void> {
  const { error } = await client.from("project_card_signals").upsert(
    { signal_id: signalId, card_id: cardId, project_id: projectId },
    { onConflict: "signal_id" },
  );
  if (error) throw new Error(`link signal failed: ${error.message}`);
}

// Remove the link between a signal and its card.
export async function unlinkSignal(
  client: SupabaseLike,
  signalId: string,
): Promise<void> {
  const del = client.from("project_card_signals").delete;
  if (!del) throw new Error("unlink signal failed: client missing delete()");
  const { error } = await del().eq("signal_id", signalId);
  if (error) throw new Error(`unlink signal failed: ${error.message}`);
}

// Return the link row for a signal, or null if the signal is not linked.
// Tombstoned rows (signal deleted) have signal_id = null and are not returned
// by this query; use listSignalsForCard to include tombstones.
export async function getLinkForSignal(
  client: SupabaseLike,
  signalId: string,
): Promise<StoredCardSignal | null> {
  const { data, error } = await client
    .from("project_card_signals")
    .select("*")
    .eq("signal_id", signalId)
    .limit(1);
  if (error) throw new Error(`get link failed: ${error.message}`);
  return ((data ?? []) as StoredCardSignal[])[0] ?? null;
}

// List all signal links for a card, including tombstoned entries.
export async function listSignalsForCard(
  client: SupabaseLike,
  cardId: string,
): Promise<StoredCardSignal[]> {
  const { data, error } = await client
    .from("project_card_signals")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`list signals for card failed: ${error.message}`);
  return (data ?? []) as StoredCardSignal[];
}

// ─── Ticket links ─────────────────────────────────────────────────────────────

export type StoredCardTicket = {
  id: string;
  card_id: string;
  source: "github" | "linear" | "jira";
  ext_id: string;
  url: string;
  status: string | null;
  assignee: string | null;
  last_seen_at: string | null;
  created_at: string;
};

export type CardTicketMetaPatch = {
  status?: string | null;
  assignee?: string | null;
  last_seen_at?: string | null;
};

// Insert a new ticket link. Idempotent on (card_id, source, ext_id) — re-linking
// the same upstream ticket to the same card is a no-op, returning the existing
// row's id via the upsert.
export async function linkTicket(
  client: SupabaseLike,
  ticket: {
    id: string;
    card_id: string;
    source: "github" | "linear" | "jira";
    ext_id: string;
    url: string;
  },
): Promise<void> {
  const { error } = await client.from("project_card_tickets").upsert(
    {
      id: ticket.id,
      card_id: ticket.card_id,
      source: ticket.source,
      ext_id: ticket.ext_id,
      url: ticket.url,
    },
    { onConflict: "card_id,source,ext_id" },
  );
  if (error) throw new Error(`link ticket failed: ${error.message}`);
}

export async function unlinkTicket(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  const del = client.from("project_card_tickets").delete;
  if (!del) throw new Error("unlink ticket failed: client missing delete()");
  const { error } = await del().eq("id", id);
  if (error) throw new Error(`unlink ticket failed: ${error.message}`);
}

export async function listTicketsForCard(
  client: SupabaseLike,
  cardId: string,
): Promise<StoredCardTicket[]> {
  const { data, error } = await client
    .from("project_card_tickets")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`list tickets failed: ${error.message}`);
  return (data ?? []) as StoredCardTicket[];
}

export async function listTicketsForCards(
  client: SupabaseLike,
  cardIds: string[],
): Promise<StoredCardTicket[]> {
  if (cardIds.length === 0) return [];
  const { data, error } = await client
    .from("project_card_tickets")
    .select("*")
    .in("card_id", cardIds)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`list tickets failed: ${error.message}`);
  return (data ?? []) as StoredCardTicket[];
}

export async function updateTicketMeta(
  client: SupabaseLike,
  id: string,
  patch: CardTicketMetaPatch,
): Promise<void> {
  const { error } = await client
    .from("project_card_tickets")
    .update(patch as Record<string, unknown>)
    .eq("id", id);
  if (error) throw new Error(`update ticket failed: ${error.message}`);
}

// Mark a ticket as stale by clearing its last_seen_at; the next on-open
// refresh will repopulate it.
export async function markTicketStale(
  client: SupabaseLike,
  id: string,
): Promise<void> {
  await updateTicketMeta(client, id, { last_seen_at: null });
}

// ─── Due cards ────────────────────────────────────────────────────────────────

export async function listCardsDueOn(
  client: SupabaseLike,
  date: Date,
): Promise<DueCard[]> {
  const projects = await listProjects(client);
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  const dayStart = new Date(y, mo, d, 0, 0, 0, 0).toISOString();
  const dayEnd = new Date(y, mo, d + 1, 0, 0, 0, 0).toISOString();

  const { data, error } = await client
    .from("project_cards")
    .select("*")
    .in("project_id", projectIds)
    .gte("due_at", dayStart)
    .lt("due_at", dayEnd)
    .order("due_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(`card list failed: ${error.message}`);
  const cards = (data ?? []) as StoredCard[];
  const nameMap = new Map(projects.map((p) => [p.id, p.name]));
  return cards.map((c) => ({ ...c, project_name: nameMap.get(c.project_id) ?? "" }));
}
