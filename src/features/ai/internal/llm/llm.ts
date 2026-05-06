// Per-LLM module interface. Each provider (anthropic, openai, groq, gemini,
// ollama) exports an `Llm` object satisfying this type. The dispatcher
// `chat()` iterates the registry rather than switching on `cfg.provider`.

import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
  LlmProvider,
} from "#/features/ai/internal/llm/client";

export type Llm = {
  id: LlmProvider;
  chat(req: ChatRequest, cfg: LlmConfig, model: string): Promise<ChatResponse>;
};
