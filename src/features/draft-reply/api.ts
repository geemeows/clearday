// HTTP handler for `POST /api/ai/draft`. Backs the "Draft with AI" buttons
// in the PR review and Slack reply composers in the Inbox detail pane.
// Routes through `askAi` so the budget meter, redactor, and `ai_disabled`
// toggle apply uniformly with the morning briefing and Ask AI features.
//
// Wire shape:
//   POST /api/ai/draft { signal_id: string, instruction?: string }
//   → DraftReplyResult

import {
  type AiSettingsRow,
  type AiSettingsStore,
  isKnownProvider,
} from "#/features/ai/api/settings";
import type { UsageStore } from "#/features/ai/internal/budget-meter";
import { AiCallRefused, askAi } from "#/features/ai/internal/client";
import type { ChatMessage } from "#/features/ai/internal/llm/client";
import { decryptSecret } from "#/shared/crypto";
import type { StoredSignal } from "#/shared/signal";

export type DraftReplyKind = "pr_comment" | "slack_reply";

export type DraftReplyResult =
  | {
      ok: true;
      draft: string;
      kind: DraftReplyKind;
      provider: string;
      model: string;
      used_fallback: boolean;
    }
  | {
      ok: false;
      reason:
        | "no_provider"
        | "budget_reached"
        | "disabled"
        | "not_found"
        | "wrong_kind"
        | "error";
      error?: string;
    };

export type DraftReplyDeps = {
  aiStore: AiSettingsStore;
  loadSignal: (signalId: string) => Promise<StoredSignal | null>;
  usageStore: UsageStore;
  keySecret: string;
  fetch: typeof fetch;
  now?: () => Date;
};

export async function handleDraftReply(
  body: { signal_id?: unknown; instruction?: unknown },
  deps: DraftReplyDeps,
): Promise<DraftReplyResult> {
  if (
    typeof body.signal_id !== "string" ||
    body.signal_id.trim().length === 0
  ) {
    return { ok: false, reason: "error", error: "signal_id (string) required" };
  }
  const instruction =
    typeof body.instruction === "string" && body.instruction.trim().length > 0
      ? body.instruction.trim()
      : null;

  const signal = await deps.loadSignal(body.signal_id.trim());
  if (!signal) return { ok: false, reason: "not_found" };

  const kind = draftKindForSignal(signal);
  if (!kind) return { ok: false, reason: "wrong_kind" };

  const row = await deps.aiStore.load();
  const settings = await aiSettingsFromRow(row, deps.keySecret);
  if (!settings) return { ok: false, reason: "no_provider" };

  const messages = buildDraftPrompt(kind, signal, instruction);

  try {
    const result = await askAi(
      { messages, maxOutputTokens: 400 },
      {
        settings,
        usageStore: deps.usageStore,
        fetch: deps.fetch,
        now: deps.now,
      },
    );
    return {
      ok: true,
      draft: result.response.content.trim(),
      kind,
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

export function draftKindForSignal(
  signal: StoredSignal,
): DraftReplyKind | null {
  if (signal.provider === "github" && signal.kind.startsWith("pr_")) {
    return "pr_comment";
  }
  if (
    signal.provider === "slack" &&
    (signal.kind === "dm" ||
      signal.kind === "mention" ||
      signal.kind === "thread_reply")
  ) {
    return "slack_reply";
  }
  return null;
}

const SYSTEM_PR =
  "You are drafting a short pull request review comment in the user's voice. " +
  "Be specific, terse, and constructive. Plain prose, no salutation or sign-off. " +
  "Do not invent code that you have not been shown. Output the comment text only.";

const SYSTEM_SLACK =
  "You are drafting a short Slack reply in the user's voice. " +
  "Be terse and direct. Plain prose, no salutation or sign-off. " +
  "Output the reply text only.";

export function buildDraftPrompt(
  kind: DraftReplyKind,
  signal: StoredSignal,
  instruction: string | null,
): ChatMessage[] {
  const system = kind === "pr_comment" ? SYSTEM_PR : SYSTEM_SLACK;
  const lines: string[] = [];
  if (kind === "pr_comment") {
    const repo = (signal.payload?.repo as string | undefined) ?? "";
    const author = (signal.payload?.author as string | undefined) ?? "";
    lines.push(`PR: ${signal.title}`);
    if (repo) lines.push(`Repo: ${repo}`);
    if (author) lines.push(`Author: @${author}`);
  } else {
    const channel = (signal.payload?.channel as string | undefined) ?? "";
    const channelType =
      (signal.payload?.channel_type as string | undefined) ?? "";
    const author = (signal.payload?.author as string | undefined) ?? "";
    const text = (signal.payload?.text as string | undefined) ?? "";
    const where =
      channelType === "im" ? "DM" : channel ? `#${channel}` : "Slack";
    lines.push(`Where: ${where}`);
    if (author) lines.push(`From: <@${author}>`);
    if (text) lines.push(`Message:\n${text}`);
  }
  const ask = instruction
    ? `Instruction: ${instruction}`
    : kind === "pr_comment"
      ? "Draft a brief review comment."
      : "Draft a brief reply.";
  return [
    { role: "system", content: system },
    { role: "user", content: `${lines.join("\n")}\n\n${ask}` },
  ];
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
    fallbackThresholdPct: row.fallback_threshold_pct ?? null,
    monthlyBudgetUsd: Number(row.monthly_budget_usd ?? 25),
    privacyMode: !!row.privacy_mode,
    redactPatterns: row.redact_patterns ?? [],
    aiDisabled: !!row.ai_disabled,
  };
}
