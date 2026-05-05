// HTTP handler for `POST /api/briefing/generate`. Pure against an injected
// AiSettingsStore + cache store + signal loader + usage store + fetch, so
// it can be tested without spinning up the Worker.
//
// Wire shape:
//   POST /api/briefing/generate { date: 'YYYY-MM-DD', force?: boolean }
//   → BriefingResult (see morning-briefing.ts)
//
// Also exposes `runBriefingTick` — the morning cron entrypoint that pre-warms
// today's briefing so it's ready when the user opens the SPA. Idempotent: a
// cached entry for the current UTC date short-circuits the LLM call.

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

// ---------------------------------------------------------------------------
// Cron tick — pre-warms today's briefing so the first SPA visit is instant.
// ---------------------------------------------------------------------------

const DEFAULT_BRIEFING_HOUR_UTC = 6;

export type BriefingTickDeps = BriefingDeps & {
  hourUtc?: number;
};

export type BriefingTickResult =
  | { kind: "generated"; date: string; cached: boolean }
  | {
      kind: "skipped";
      reason: "not_due" | "no_provider" | "disabled" | "budget_reached";
    }
  | { kind: "error"; error: string };

export async function runBriefingTick(
  deps: BriefingTickDeps,
): Promise<BriefingTickResult> {
  const now = deps.now?.() ?? new Date();
  const hour = deps.hourUtc ?? DEFAULT_BRIEFING_HOUR_UTC;
  if (now.getUTCHours() < hour) return { kind: "skipped", reason: "not_due" };

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) return { kind: "skipped", reason: "no_provider" };

  const date = utcDateString(now);
  const signals = await deps.loadSignals();
  const result = await generateBriefing({
    date,
    force: false,
    signals,
    settings,
    cacheStore: deps.cacheStore,
    usageStore: deps.usageStore,
    fetch: deps.fetch,
    now: deps.now,
  });

  if (result.ok) {
    return { kind: "generated", date, cached: result.cached };
  }
  if (
    result.reason === "no_provider" ||
    result.reason === "disabled" ||
    result.reason === "budget_reached"
  ) {
    return { kind: "skipped", reason: result.reason };
  }
  return { kind: "error", error: result.error ?? "unknown error" };
}

function utcDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
