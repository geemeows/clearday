// Provider-agnostic LLM client. Pure module: pass in `{ provider, apiKey,
// fetch, defaultModel?, baseUrl? }` and call `chat({ messages, model? })`.
//
// Each backend (Anthropic, OpenAI, Groq, Gemini, Ollama) is its own module
// under `llms/` exposing an `Llm` object. `chat()` looks the LLM up in the
// registry and delegates — no switch on `cfg.provider`.
//
// No streaming in v1 — every backend is buffered. No tool calls. No
// system-message-as-first-user reshaping; if the caller wants a system
// prompt they pass `{ role: 'system', ... }` and we route it correctly.

import { LLMS } from "#/features/ai/internal/llm/llms";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  /** Soft cap on completion tokens (best-effort across providers). */
  maxOutputTokens?: number;
};

export type ChatResponse = {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
};

export type LlmProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "ollama"
  | "openrouter";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  defaultModel?: string;
  /** Override base URL (required for ollama; optional for others). */
  baseUrl?: string;
  fetch: typeof fetch;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export async function chat(
  req: ChatRequest,
  cfg: LlmConfig,
): Promise<ChatResponse> {
  const model = req.model ?? cfg.defaultModel;
  if (!model) {
    throw new LlmError("model is required (no defaultModel configured)");
  }
  if (req.messages.length === 0) {
    throw new LlmError("messages must be non-empty");
  }
  return LLMS[cfg.provider].chat(req, cfg, model);
}

/** Tiny prompt for the "Test connection" button. */
export const TEST_PROMPT: ChatMessage[] = [
  { role: "user", content: "Reply with the single word: OK" },
];
