// HTTP handlers for /api/automations (GET/PUT). Pure against an injected
// store; the Worker entry plumbs Supabase. PUT replaces the entire list — the
// builder UI sends the full automation set on every save, which sidesteps the
// per-id concurrency dance for v1 (mirrors the old /api/inbox-rules contract).

import {
  type Automation,
  validateAutomations,
} from "#/features/automations/engine";

export type AutomationsStore = {
  load: () => Promise<Automation[]>;
  save: (automations: Automation[]) => Promise<Automation[]>;
};

export type GetResult = { automations: Automation[] };

export async function getAutomations(
  store: AutomationsStore,
): Promise<GetResult> {
  const automations = await store.load();
  return { automations };
}

export type PutResult =
  | { ok: true; automations: Automation[] }
  | { ok: false; error: string };

export async function putAutomations(
  body: unknown,
  store: AutomationsStore,
): Promise<PutResult> {
  const parsed = parseBody(body);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const errors = validateAutomations(parsed.automations);
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  const saved = await store.save(parsed.automations);
  return { ok: true, automations: saved };
}

function parseBody(
  body: unknown,
): { ok: true; automations: Automation[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const automations = (body as { automations?: unknown }).automations;
  if (!Array.isArray(automations)) {
    return { ok: false, error: "automations must be an array" };
  }
  return { ok: true, automations: automations as Automation[] };
}
