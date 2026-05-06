// LLM registry. The dispatcher iterates `LLMS[cfg.provider]`. Adding a new
// LLM = one file under llms/ and one entry here.

import type { LlmProvider } from "#/features/ai/internal/llm/client";
import type { Llm } from "#/features/ai/internal/llm/llm";
import { anthropic } from "#/features/ai/internal/llm/llms/anthropic";
import { gemini } from "#/features/ai/internal/llm/llms/gemini";
import { groq } from "#/features/ai/internal/llm/llms/groq";
import { ollama } from "#/features/ai/internal/llm/llms/ollama";
import { openai } from "#/features/ai/internal/llm/llms/openai";

export const LLMS: Record<LlmProvider, Llm> = {
  anthropic,
  openai,
  groq,
  gemini,
  ollama,
};
