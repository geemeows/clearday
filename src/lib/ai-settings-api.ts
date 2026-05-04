// Handlers for /api/ai/settings (GET/PUT) and /api/ai/test (POST). Pure
// against an injected store + deps so we can test without spinning up the
// full Worker. The Worker entry plumbs Supabase + fetch + the AI_KEY_SECRET
// in.
//
// Wire shape:
//   GET  /api/ai/settings → { provider, default_model, base_url,
//                             has_api_key, last_validated_at }
//   PUT  /api/ai/settings { provider, default_model?, base_url?, api_key? }
//                          → same shape; api_key (when present) is encrypted
//                            before persisting; never returned in plaintext.
//   POST /api/ai/test     → { ok: true, model } | { ok: false, error }
//                          On success bumps last_validated_at.

import { chat, type LlmProvider, TEST_PROMPT } from "#/lib/llm-client";
import { decryptSecret, encryptSecret } from "#/lib/llm-crypto";

export type AiSettingsRow = {
  provider: string | null;
  model: string | null;
  api_key: string | null;
  base_url: string | null;
  last_validated_at: string | null;
};

export type AiSettingsView = {
  provider: LlmProvider | null;
  default_model: string | null;
  base_url: string | null;
  has_api_key: boolean;
  last_validated_at: string | null;
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

function viewOf(row: AiSettingsRow | null): AiSettingsView {
  return {
    provider: isKnownProvider(row?.provider) ? row.provider : null,
    default_model: row?.model ?? null,
    base_url: row?.base_url ?? null,
    has_api_key: !!row?.api_key,
    last_validated_at: row?.last_validated_at ?? null,
  };
}

export async function getAiSettings(
  deps: AiSettingsDeps,
): Promise<AiSettingsView> {
  const row = await deps.store.load();
  return viewOf(row);
}

export type PutBody = {
  provider?: unknown;
  default_model?: unknown;
  base_url?: unknown;
  api_key?: unknown;
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
  const saved = await deps.store.save(patch);
  return { ok: true, settings: viewOf(saved) };
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
