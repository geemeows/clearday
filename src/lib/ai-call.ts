// Single AI-call seam. Every user-facing AI call (morning briefing,
// ask-AI, draft replies) runs through `runAiCall(...)` so the budget
// meter, the redactor, and the `ai_disabled` toggle apply uniformly.
//
// runAiCall:
//   1. Refuses if AI is disabled or not configured.
//   2. Computes monthly spend, decides which model to actually call
//      (fallback at 80% of budget, refuse at 100%).
//   3. If privacy mode is on, redacts every message's content.
//   4. Calls `chat()` with the decided model.
//   5. Records usage to `ai_usage` (token counts + computed cost).

import {
  decideModel,
  monthlySpend,
  recordUsage,
  type UsageStore,
} from "#/lib/ai-budget-meter";
import { redactMessages } from "#/lib/ai-redactor";
import {
  type ChatMessage,
  type ChatResponse,
  chat,
  type LlmProvider,
} from "#/lib/llm-client";

export type AiCallSettings = {
  provider: LlmProvider;
  apiKey: string;
  defaultModel: string;
  baseUrl?: string;
  fallbackModel: string | null;
  monthlyBudgetUsd: number;
  privacyMode: boolean;
  redactPatterns: string[];
  aiDisabled: boolean;
};

export type AiCallRequest = {
  messages: ChatMessage[];
  /** Override the default model from settings. */
  requestedModel?: string;
  maxOutputTokens?: number;
};

export type AiCallResult = {
  response: ChatResponse;
  /** Model the meter actually selected. */
  model: string;
  usedFallback: boolean;
  /** Spend / budget ratio at decision time. */
  ratio: number;
};

export class AiCallRefused extends Error {
  constructor(
    message: string,
    readonly reason: "disabled" | "budget_reached" | "not_configured",
  ) {
    super(message);
    this.name = "AiCallRefused";
  }
}

export type RunAiCallDeps = {
  settings: AiCallSettings;
  usageStore: UsageStore;
  fetch: typeof fetch;
  now?: () => Date;
};

export async function runAiCall(
  req: AiCallRequest,
  deps: RunAiCallDeps,
): Promise<AiCallResult> {
  const s = deps.settings;
  if (s.aiDisabled) {
    throw new AiCallRefused("AI is disabled for this account.", "disabled");
  }
  if (!s.apiKey && s.provider !== "ollama") {
    throw new AiCallRefused(
      "No AI provider is configured. Add a key in Settings → AI provider.",
      "not_configured",
    );
  }

  const spent = await monthlySpend(deps.usageStore, deps.now?.() ?? new Date());
  const decision = decideModel({
    requested: req.requestedModel ?? s.defaultModel,
    fallback: s.fallbackModel,
    monthBudget: s.monthlyBudgetUsd,
    monthSpent: spent,
  });
  if (decision.refused) {
    throw new AiCallRefused(
      "AI disabled — monthly budget reached.",
      "budget_reached",
    );
  }

  const messages = s.privacyMode
    ? redactMessages(req.messages, s.redactPatterns)
    : req.messages;

  const response = await chat(
    {
      messages,
      model: decision.model,
      maxOutputTokens: req.maxOutputTokens,
    },
    {
      provider: s.provider,
      apiKey: s.apiKey,
      defaultModel: s.defaultModel,
      baseUrl: s.baseUrl,
      fetch: deps.fetch,
    },
  );

  await recordUsage(
    {
      provider: s.provider,
      model: decision.model,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      now: deps.now?.() ?? new Date(),
    },
    deps.usageStore,
  );

  return {
    response,
    model: decision.model,
    usedFallback: decision.usedFallback,
    ratio: decision.ratio,
  };
}
