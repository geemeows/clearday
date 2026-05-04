// HTTP handler for `POST /api/ai/ask`. Backs the Cmd-K palette's "Ask AI"
// footer. Pure against an injected AiSettingsStore + signal loader + usage
// store + fetch, so it can be tested without spinning up the Worker.
//
// Wire shape:
//   POST /api/ai/ask { q: string, signal_ids?: string[] }
//   → AskAiResult

import type { UsageStore } from "#/lib/ai-budget-meter";
import { AiCallRefused, runAiCall } from "#/lib/ai-call";
import {
  type AiSettingsRow,
  type AiSettingsStore,
  isKnownProvider,
} from "#/lib/ai-settings-api";
import type { ChatMessage } from "#/lib/llm-client";
import { decryptSecret } from "#/lib/llm-crypto";
import type { StoredSignal } from "#/lib/signal";

export type AskAiResult =
  | {
      ok: true;
      answer: string;
      provider: string;
      model: string;
      used_fallback: boolean;
    }
  | {
      ok: false;
      reason: "no_provider" | "budget_reached" | "disabled" | "error";
      error?: string;
    };

export type AskAiDeps = {
  aiStore: AiSettingsStore;
  loadSignals: (signalIds?: string[]) => Promise<StoredSignal[]>;
  usageStore: UsageStore;
  keySecret: string;
  fetch: typeof fetch;
  now?: () => Date;
};

export async function handleAskAi(
  body: { q?: unknown; signal_ids?: unknown },
  deps: AskAiDeps,
): Promise<AskAiResult> {
  if (typeof body.q !== "string" || body.q.trim().length === 0) {
    return { ok: false, reason: "error", error: "q (string) required" };
  }
  const signalIds = Array.isArray(body.signal_ids)
    ? body.signal_ids.filter((v): v is string => typeof v === "string")
    : undefined;

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) return { ok: false, reason: "no_provider" };

  let context: StoredSignal[] = [];
  try {
    context = await deps.loadSignals(signalIds);
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const messages = buildAskAiPrompt(body.q.trim(), context);

  try {
    const result = await runAiCall(
      { messages, maxOutputTokens: 600 },
      {
        settings,
        usageStore: deps.usageStore,
        fetch: deps.fetch,
        now: deps.now,
      },
    );
    return {
      ok: true,
      answer: result.response.content.trim(),
      provider: settings.provider,
      model: result.model,
      used_fallback: result.usedFallback,
    };
  } catch (err) {
    if (err instanceof AiCallRefused) {
      const reason: "no_provider" | "budget_reached" | "disabled" =
        err.reason === "not_configured"
          ? "no_provider"
          : err.reason === "budget_reached"
            ? "budget_reached"
            : "disabled";
      return { ok: false, reason };
    }
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const SYSTEM_PROMPT =
  "You are Devy, a terse assistant that answers questions about the user's " +
  "current work. Use only the provided Signals (PRs, meetings, Slack " +
  "messages, tickets) as context. If the answer isn't in the context, say " +
  "you don't have that information rather than guessing. Keep answers short.";

export function buildAskAiPrompt(
  question: string,
  signals: StoredSignal[],
): ChatMessage[] {
  const lines: string[] = [];
  if (signals.length === 0) {
    lines.push("(no current Signals available as context)");
  } else {
    for (const s of signals) {
      const meta = describeSignal(s);
      lines.push(`- [${s.provider}/${s.kind}] ${s.title}${meta}`);
    }
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context (current Signals):\n${lines.join("\n")}\n\nQuestion: ${question}`,
    },
  ];
}

function describeSignal(s: StoredSignal): string {
  const bits: string[] = [];
  if (s.provider === "slack") {
    const ch = (s.payload?.channel as string | undefined) ?? "";
    const author = (s.payload?.author as string | undefined) ?? "";
    if (ch) bits.push(`#${ch}`);
    if (author) bits.push(`from <@${author}>`);
  } else if (s.kind === "meeting") {
    const startsAt = s.payload?.starts_at as string | undefined;
    if (startsAt) bits.push(`at ${startsAt}`);
  } else {
    const repo = (s.payload?.repo as string | undefined) ?? "";
    const author = (s.payload?.author as string | undefined) ?? "";
    if (repo) bits.push(repo);
    if (author) bits.push(`by @${author}`);
  }
  return bits.length > 0 ? ` (${bits.join(" · ")})` : "";
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
