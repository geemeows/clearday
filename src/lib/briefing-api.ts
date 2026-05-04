// HTTP handler for `POST /api/briefing/generate`. Pure against an injected
// AiSettingsStore + cache store + signal loader + usage store + fetch, so
// it can be tested without spinning up the Worker.
//
// Wire shape:
//   POST /api/briefing/generate { date: 'YYYY-MM-DD', force?: boolean }
//   → BriefingResult (see morning-briefing.ts)

import type { UsageStore } from "#/lib/ai-budget-meter";
import type { AiSettingsRow, AiSettingsStore } from "#/lib/ai-settings-api";
import { isKnownProvider } from "#/lib/ai-settings-api";
import { decryptSecret } from "#/lib/llm-crypto";
import {
  type BriefingCacheStore,
  type BriefingResult,
  generateBriefing,
} from "#/lib/morning-briefing";
import type { StoredSignal } from "#/lib/signal";

export type BriefingDeps = {
  aiStore: AiSettingsStore;
  cacheStore: BriefingCacheStore;
  loadSignals: () => Promise<StoredSignal[]>;
  usageStore: UsageStore;
  keySecret: string;
  fetch: typeof fetch;
  now?: () => Date;
};

export async function handleBriefingGenerate(
  body: { date?: unknown; force?: unknown },
  deps: BriefingDeps,
): Promise<BriefingResult> {
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return { ok: false, reason: "error", error: "date (YYYY-MM-DD) required" };
  }
  const force = !!body.force;

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) {
    return { ok: false, reason: "no_provider" };
  }

  const signals = await deps.loadSignals();
  return generateBriefing({
    date: body.date,
    force,
    signals,
    settings,
    cacheStore: deps.cacheStore,
    usageStore: deps.usageStore,
    fetch: deps.fetch,
    now: deps.now,
  });
}

async function aiSettingsFromRow(row: AiSettingsRow | null, keySecret: string) {
  if (!row || !isKnownProvider(row.provider) || !row.model) return null;
  if (!row.api_key && row.provider !== "ollama") return null;
  let apiKey = "";
  if (row.api_key) {
    try {
      apiKey = await decryptSecret(row.api_key, keySecret);
    } catch {
      return null;
    }
  }
  return {
    provider: row.provider,
    apiKey,
    defaultModel: row.model,
    baseUrl: row.base_url ?? undefined,
    fallbackModel: row.fallback_model ?? null,
    monthlyBudgetUsd: Number(row.monthly_budget_usd ?? 25),
    privacyMode: !!row.privacy_mode,
    redactPatterns: row.redact_patterns ?? [],
    aiDisabled: !!row.ai_disabled,
  };
}
