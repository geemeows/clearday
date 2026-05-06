// HTTP handler for `POST /api/briefing/generate`. Pure against an injected
// AiSettingsStore + cache store + signal loader + usage store + fetch, so
// it can be tested without spinning up the Worker.
//
// Wire shape:
//   POST /api/briefing/generate { date?: 'YYYY-MM-DD', force?: boolean }
//   → BriefingResult (see morning-briefing.ts)
//
// `date` is optional: when omitted (or null), the server derives today's
// local-day string from the user's stored IANA timezone in
// `user_preferences.timezone`, falling back to UTC when that's unset or
// unrecognized. Clients should omit it so a misconfigured browser clock
// doesn't shift the cache key.
//
// Also exposes `runBriefingTick` — the morning cron entrypoint that pre-warms
// today's briefing so it's ready when the user opens the SPA. Idempotent: a
// cached entry for the current local date short-circuits the LLM call.

import type { UsageStore } from "#/lib/ai-budget-meter";
import type { AiSettingsRow, AiSettingsStore } from "#/lib/ai-settings-api";
import { isKnownProvider } from "#/lib/ai-settings-api";
import { decryptSecret } from "#/lib/llm-crypto";
import {
  type BriefingCacheStore,
  type BriefingResult,
  generateBriefing,
} from "#/lib/morning-briefing";
import type { StoredSignal } from "#/shared/signal";

export type BriefingDeps = {
  aiStore: AiSettingsStore;
  cacheStore: BriefingCacheStore;
  loadSignals: () => Promise<StoredSignal[]>;
  usageStore: UsageStore;
  keySecret: string;
  fetch: typeof fetch;
  now?: () => Date;
  /**
   * Returns the user's IANA timezone (e.g. "America/Los_Angeles"). Used to
   * compute today's local-day string when the request body omits `date`.
   * Optional — callers without the seam fall back to UTC.
   */
  loadTimezone?: () => Promise<string | null>;
};

export async function handleBriefingGenerate(
  body: { date?: unknown; force?: unknown },
  deps: BriefingDeps,
): Promise<BriefingResult> {
  let date: string;
  if (body.date === undefined || body.date === null) {
    const now = deps.now?.() ?? new Date();
    const tz = (await deps.loadTimezone?.()) ?? null;
    date = localDateForTimezone(now, tz);
  } else if (
    typeof body.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.date)
  ) {
    date = body.date;
  } else {
    return { ok: false, reason: "error", error: "date must be YYYY-MM-DD" };
  }
  const force = !!body.force;

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) {
    return { ok: false, reason: "no_provider" };
  }

  const signals = await deps.loadSignals();
  return generateBriefing({
    date,
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

const DEFAULT_BRIEFING_HOUR = 6;

export type BriefingTickDeps = BriefingDeps & {
  /**
   * Hour of day (0-23) at which the morning briefing becomes due. Evaluated
   * in the user's IANA timezone (from `loadTimezone`); falls back to UTC when
   * no timezone is plumbed. Defaults to 6 (local 6am).
   */
  hour?: number;
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
  const tz = (await deps.loadTimezone?.()) ?? null;
  const hour = deps.hour ?? DEFAULT_BRIEFING_HOUR;
  if (localHourForTimezone(now, tz) < hour) {
    return { kind: "skipped", reason: "not_due" };
  }

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) return { kind: "skipped", reason: "no_provider" };

  const date = localDateForTimezone(now, tz);
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

/**
 * Returns the calendar date in the given IANA timezone as `YYYY-MM-DD`. When
 * `tz` is null or unrecognized by the runtime, falls back to UTC. Exported
 * for tests; used by both the on-demand handler and the cron tick.
 */
export function localDateForTimezone(now: Date, tz: string | null): string {
  if (!tz) return utcDateString(now);
  try {
    // en-CA renders as YYYY-MM-DD which round-trips into our cache key.
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now);
  } catch {
    return utcDateString(now);
  }
}

/**
 * Returns the hour of day (0-23) in the given IANA timezone. Falls back to
 * UTC when `tz` is null or unrecognized by the runtime. Used by the cron
 * tick to gate the morning fire-time on the user's local clock so a user
 * in Tokyo gets their briefing at local 6am, not UTC 6am.
 */
export function localHourForTimezone(now: Date, tz: string | null): number {
  if (!tz) return now.getUTCHours();
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    });
    const parsed = Number.parseInt(fmt.format(now), 10);
    return Number.isFinite(parsed) ? parsed : now.getUTCHours();
  } catch {
    return now.getUTCHours();
  }
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
