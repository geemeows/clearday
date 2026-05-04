// Handlers for /api/ai/settings (GET/PUT) and /api/ai/test (POST). Pure
// against an injected store + deps so we can test without spinning up the
// full Worker. The Worker entry plumbs Supabase + fetch + the AI_KEY_SECRET
// in.
//
// Wire shape:
//   GET  /api/ai/settings → AiSettingsView (no plaintext key, includes
//                            month_spent_usd for the budget UI)
//   PUT  /api/ai/settings { provider, default_model?, base_url?, api_key?,
//                           monthly_budget_usd?, fallback_model?,
//                           privacy_mode?, redact_patterns?, ai_disabled? }
//                          → AiSettingsView; api_key (when present) is
//                            encrypted before persisting; never returned
//                            in plaintext.
//   POST /api/ai/test     → { ok: true, model } | { ok: false, error }
//                            On success bumps last_validated_at.

import { monthlySpend, type UsageStore } from "#/lib/ai-budget-meter";
import { chat, type LlmProvider, TEST_PROMPT } from "#/lib/llm-client";
import { decryptSecret, encryptSecret } from "#/lib/llm-crypto";

export type AiSettingsRow = {
  provider: string | null;
  model: string | null;
  api_key: string | null;
  base_url: string | null;
  last_validated_at: string | null;
  monthly_budget_usd: number | string | null;
  fallback_model: string | null;
  privacy_mode: boolean | null;
  redact_patterns: string[] | null;
  ai_disabled: boolean | null;
};

export type AiSettingsView = {
  provider: LlmProvider | null;
  default_model: string | null;
  base_url: string | null;
  has_api_key: boolean;
  last_validated_at: string | null;
  monthly_budget_usd: number;
  fallback_model: string | null;
  privacy_mode: boolean;
  redact_patterns: string[];
  ai_disabled: boolean;
  month_spent_usd: number;
};

export type AiSettingsStore = {
  load: () => Promise<AiSettingsRow | null>;
  save: (patch: Partial<AiSettingsRow>) => Promise<AiSettingsRow>;
};

export type AiSettingsDeps = {
  store: AiSettingsStore;
  /** Worker secret for envelope-encrypting the API key. */
  keySecret: string;
  fetch: typeof fetch;
  now?: () => Date;
  /**
   * Used for the budget panel in Settings. Optional so existing tests can
   * skip the spend lookup; when omitted, `month_spent_usd` is 0.
   */
  usageStore?: UsageStore;
};

const KNOWN_PROVIDERS: LlmProvider[] = [
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "ollama",
];

export function isKnownProvider(p: unknown): p is LlmProvider {
  return typeof p === "string" && (KNOWN_PROVIDERS as string[]).includes(p);
}

function viewOf(row: AiSettingsRow | null, monthSpent: number): AiSettingsView {
  return {
    provider: isKnownProvider(row?.provider) ? row.provider : null,
    default_model: row?.model ?? null,
    base_url: row?.base_url ?? null,
    has_api_key: !!row?.api_key,
    last_validated_at: row?.last_validated_at ?? null,
    monthly_budget_usd: Number(row?.monthly_budget_usd ?? 25),
    fallback_model: row?.fallback_model ?? null,
    privacy_mode: !!row?.privacy_mode,
    redact_patterns: row?.redact_patterns ?? [],
    ai_disabled: !!row?.ai_disabled,
    month_spent_usd: monthSpent,
  };
}

export async function getAiSettings(
  deps: AiSettingsDeps,
): Promise<AiSettingsView> {
  const row = await deps.store.load();
  const spent = deps.usageStore
    ? await monthlySpend(deps.usageStore, deps.now?.() ?? new Date())
    : 0;
  return viewOf(row, spent);
}

export type PutBody = {
  provider?: unknown;
  default_model?: unknown;
  base_url?: unknown;
  api_key?: unknown;
  monthly_budget_usd?: unknown;
  fallback_model?: unknown;
  privacy_mode?: unknown;
  redact_patterns?: unknown;
  ai_disabled?: unknown;
};

export async function putAiSettings(
  body: PutBody,
  deps: AiSettingsDeps,
): Promise<
  { ok: true; settings: AiSettingsView } | { ok: false; error: string }
> {
  if (!isKnownProvider(body.provider)) {
    return { ok: false, error: "unknown provider" };
  }
  const patch: Partial<AiSettingsRow> = {
    provider: body.provider,
    model: typeof body.default_model === "string" ? body.default_model : null,
    base_url:
      typeof body.base_url === "string" && body.base_url.trim().length > 0
        ? body.base_url.trim()
        : null,
  };
  if (typeof body.api_key === "string" && body.api_key.length > 0) {
    patch.api_key = await encryptSecret(body.api_key, deps.keySecret);
    // Resetting the key invalidates any prior "Last validated" stamp.
    patch.last_validated_at = null;
  }
  if (body.monthly_budget_usd !== undefined) {
    const n = Number(body.monthly_budget_usd);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: "monthly_budget_usd must be a non-negative number",
      };
    }
    patch.monthly_budget_usd = n;
  }
  if (body.fallback_model !== undefined) {
    patch.fallback_model =
      typeof body.fallback_model === "string" &&
      body.fallback_model.trim().length > 0
        ? body.fallback_model.trim()
        : null;
  }
  if (body.privacy_mode !== undefined) {
    patch.privacy_mode = !!body.privacy_mode;
  }
  if (body.redact_patterns !== undefined) {
    if (!Array.isArray(body.redact_patterns)) {
      return { ok: false, error: "redact_patterns must be an array" };
    }
    patch.redact_patterns = body.redact_patterns
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (body.ai_disabled !== undefined) {
    patch.ai_disabled = !!body.ai_disabled;
  }

  const saved = await deps.store.save(patch);
  const spent = deps.usageStore
    ? await monthlySpend(deps.usageStore, deps.now?.() ?? new Date())
    : 0;
  return { ok: true, settings: viewOf(saved, spent) };
}

export async function testAiConnection(
  deps: AiSettingsDeps,
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  const row = await deps.store.load();
  if (!row || !isKnownProvider(row.provider)) {
    return { ok: false, error: "no AI provider configured" };
  }
  if (!row.model) return { ok: false, error: "no default model configured" };
  if (!row.api_key && row.provider !== "ollama") {
    return { ok: false, error: "no API key configured" };
  }
  let apiKey = "";
  if (row.api_key) {
    try {
      apiKey = await decryptSecret(row.api_key, deps.keySecret);
    } catch {
      return { ok: false, error: "stored API key could not be decrypted" };
    }
  }
  try {
    const res = await chat(
      { messages: TEST_PROMPT, maxOutputTokens: 16 },
      {
        provider: row.provider,
        apiKey,
        defaultModel: row.model,
        baseUrl: row.base_url ?? undefined,
        fetch: deps.fetch,
      },
    );
    const now = (deps.now ?? (() => new Date()))();
    await deps.store.save({ last_validated_at: now.toISOString() });
    return { ok: true, model: res.model };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
