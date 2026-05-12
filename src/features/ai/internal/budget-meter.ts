// AI budget meter. Two responsibilities:
//
// 1. `decideModel({ requested, fallback, monthBudget, monthSpent,
//    fallbackThresholdPct })` — pure function that returns which model to
//    actually call given the current monthly spend. Below the fallback
//    threshold: requested. ≥threshold and <100% with a fallback configured:
//    fallback. ≥100%: refused. With no budget configured (monthBudget <= 0):
//    always run requested, never refuse. `fallbackThresholdPct` is the
//    user-configurable trigger (50/70/80/90); `null` means "never switch"
//    and `undefined` defaults to 80% for back-compat.
//
// 2. `recordUsage(...)` and `monthlySpend(...)` — store-shaped operations
//    against `public.ai_usage`. Cost is computed from a small built-in
//    pricing table; unknown models record 0 USD (their token counts are
//    still recorded so an admin can audit calls later).
//
// The dispatcher seam (`askAi` in ai-call.ts) is what binds these
// together with the redactor and `chat()` from llm-client.

export type DecideArgs = {
  requested: string;
  fallback: string | null;
  monthBudget: number;
  monthSpent: number;
  /**
   * User-configured percent of `monthBudget` at which to swap to `fallback`.
   * `null` disables the swap entirely; `undefined` defaults to the legacy
   * 80% trigger so existing callers keep working.
   */
  fallbackThresholdPct?: number | null;
};

export type Decision = {
  model: string;
  /** True when the meter swapped to the configured fallback. */
  usedFallback: boolean;
  /** True when the meter refused to run any model (>= 100% of budget). */
  refused: boolean;
  /** Spend / budget ratio at decision time, [0, ∞). */
  ratio: number;
};

export const FALLBACK_THRESHOLD = 0.8;
export const REFUSE_THRESHOLD = 1.0;

export function decideModel(args: DecideArgs): Decision {
  const { requested, fallback, monthBudget, monthSpent } = args;
  const ratio = monthBudget > 0 ? monthSpent / monthBudget : 0;
  if (monthBudget > 0 && ratio >= REFUSE_THRESHOLD) {
    return { model: requested, usedFallback: false, refused: true, ratio };
  }
  const threshold =
    args.fallbackThresholdPct === undefined
      ? FALLBACK_THRESHOLD
      : args.fallbackThresholdPct === null
        ? null
        : args.fallbackThresholdPct / 100;
  if (monthBudget > 0 && threshold !== null && ratio >= threshold && fallback) {
    return { model: fallback, usedFallback: true, refused: false, ratio };
  }
  return { model: requested, usedFallback: false, refused: false, ratio };
}

// ---------------- Pricing ----------------
//
// Per-million-token prices in USD. Approximate, conservative — meant to
// keep the budget meter honest, not to match a billing statement to the
// cent. Unknown models return zeros so cost is recorded as 0.

type Price = { inputPer1M: number; outputPer1M: number };

const PRICING: Record<string, Price> = {
  // Anthropic
  "claude-opus-4-7": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4-5": { inputPer1M: 1, outputPer1M: 5 },
  "claude-haiku-4-5-20251001": { inputPer1M: 1, outputPer1M: 5 },
  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  // Gemini
  "gemini-1.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5 },
  // Groq
  "llama-3.1-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "llama-3.1-8b-instant": { inputPer1M: 0.05, outputPer1M: 0.08 },
};

export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICING[model];
  if (!price) return 0;
  const inUsd = (promptTokens / 1_000_000) * price.inputPer1M;
  const outUsd = (completionTokens / 1_000_000) * price.outputPer1M;
  return Math.round((inUsd + outUsd) * 10000) / 10000; // 4dp
}

// ---------------- Store ops ----------------

export type UsageStore = {
  // biome-ignore lint/suspicious/noExplicitAny: thin Supabase-like shape
  from: (table: string) => any;
};

export type RecordUsageInput = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
  now?: Date;
};

export async function recordUsage(
  input: RecordUsageInput,
  store: UsageStore,
): Promise<void> {
  const cost =
    typeof input.costUsd === "number"
      ? input.costUsd
      : computeCost(input.model, input.promptTokens, input.completionTokens);
  const day = isoDay(input.now ?? new Date());
  const { error } = await store.from("ai_usage").insert({
    day,
    provider: input.provider,
    model: input.model,
    prompt_tokens: input.promptTokens,
    completion_tokens: input.completionTokens,
    cost_usd: cost,
  });
  if (error) throw new Error(error.message);
}

/**
 * Sum `cost_usd` across `ai_usage` rows in the calendar month containing
 * `now`. Returns 0 on an empty result.
 */
export async function monthlySpend(
  store: UsageStore,
  now: Date = new Date(),
): Promise<number> {
  const { start, end } = monthBounds(now);
  const { data, error } = await store
    .from("ai_usage")
    .select("cost_usd")
    .gte("day", isoDay(start))
    .lt("day", isoDay(end));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ cost_usd: number | string | null }>;
  return rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
}

// ---------------- Date helpers ----------------

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { start, end };
}
