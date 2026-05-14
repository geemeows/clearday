// HTTP handlers for /api/inbox-rules (GET / POST / PATCH /:id / DELETE /:id).
// Pure against an injected store; the Worker entry plumbs Supabase.

export type RuleCondition = { field: string; op: string; value: string };

export type InboxRule = {
  id: string;
  name: string;
  match_all: boolean;
  conditions: RuleCondition[];
  action: string;
  action_param: string | null;
  enabled: boolean;
  hits_30d: number;
  created_at: string;
};

export type NewInboxRule = Omit<InboxRule, "id" | "hits_30d" | "created_at">;

export type PatchInboxRule = Partial<
  Pick<InboxRule, "name" | "match_all" | "conditions" | "action" | "action_param" | "enabled">
>;

export type InboxRulesStore = {
  list: () => Promise<InboxRule[]>;
  create: (rule: NewInboxRule) => Promise<InboxRule>;
  patch: (id: string, patch: PatchInboxRule) => Promise<InboxRule | null>;
  delete: (id: string) => Promise<boolean>;
};

export type ListResult = { rules: InboxRule[] };

export async function listInboxRules(store: InboxRulesStore): Promise<ListResult> {
  const rules = await store.list();
  return { rules };
}

export type CreateResult =
  | { ok: true; rule: InboxRule }
  | { ok: false; error: string };

export async function createInboxRule(
  body: unknown,
  store: InboxRulesStore,
): Promise<CreateResult> {
  const parsed = parseNew(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rule = await store.create(parsed.rule);
  return { ok: true, rule };
}

export type PatchResult =
  | { ok: true; rule: InboxRule }
  | { ok: false; error: string };

export async function patchInboxRule(
  id: string,
  body: unknown,
  store: InboxRulesStore,
): Promise<PatchResult> {
  if (!id) return { ok: false, error: "id required" };
  const parsed = parsePatch(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const rule = await store.patch(id, parsed.patch);
  if (!rule) return { ok: false, error: "rule not found" };
  return { ok: true, rule };
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deleteInboxRule(
  id: string,
  store: InboxRulesStore,
): Promise<DeleteResult> {
  if (!id) return { ok: false, error: "id required" };
  const found = await store.delete(id);
  if (!found) return { ok: false, error: "rule not found" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

function parseNew(
  body: unknown,
): { ok: true; rule: NewInboxRule } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.action !== "string" || !b.action) {
    return { ok: false, error: "action is required" };
  }
  return {
    ok: true,
    rule: {
      name: typeof b.name === "string" ? b.name : "",
      match_all: b.match_all !== false,
      conditions: Array.isArray(b.conditions)
        ? (b.conditions as RuleCondition[])
        : [],
      action: b.action,
      action_param:
        typeof b.action_param === "string" ? b.action_param : null,
      enabled: b.enabled !== false,
    },
  };
}

function parsePatch(
  body: unknown,
): { ok: true; patch: PatchInboxRule } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const patch: PatchInboxRule = {};
  if ("name" in b) patch.name = typeof b.name === "string" ? b.name : "";
  if ("match_all" in b) patch.match_all = b.match_all !== false;
  if ("conditions" in b)
    patch.conditions = Array.isArray(b.conditions)
      ? (b.conditions as RuleCondition[])
      : [];
  if ("action" in b && typeof b.action === "string") patch.action = b.action;
  if ("action_param" in b)
    patch.action_param =
      typeof b.action_param === "string" ? b.action_param : null;
  if ("enabled" in b) patch.enabled = b.enabled === true;
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "no patchable fields provided" };
  }
  return { ok: true, patch };
}
