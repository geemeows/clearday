// HTTP handlers for /api/inbox-rules (GET/PUT). Pure against an injected
// store; the Worker entry plumbs Supabase. PUT replaces the entire list — the
// Settings panel sends the full rule set on every save, which sidesteps the
// per-id concurrency dance for v1.

import { type InboxRule, validateInboxRules } from "#/lib/inbox-rules-engine";

export type InboxRulesStore = {
  load: () => Promise<InboxRule[]>;
  save: (rules: InboxRule[]) => Promise<InboxRule[]>;
};

export type GetResult = { rules: InboxRule[] };

export async function getInboxRules(
  store: InboxRulesStore,
): Promise<GetResult> {
  const rules = await store.load();
  return { rules };
}

export type PutResult =
  | { ok: true; rules: InboxRule[] }
  | { ok: false; error: string };

export async function putInboxRules(
  body: unknown,
  store: InboxRulesStore,
): Promise<PutResult> {
  const parsed = parseRulesBody(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const errors = validateInboxRules(parsed.rules);
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  const saved = await store.save(parsed.rules);
  return { ok: true, rules: saved };
}

function parseRulesBody(
  body: unknown,
): { ok: true; rules: InboxRule[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const rules = (body as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) {
    return { ok: false, error: "rules must be an array" };
  }
  return { ok: true, rules: rules as InboxRule[] };
}
