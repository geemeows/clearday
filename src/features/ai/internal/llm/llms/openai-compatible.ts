// Shared OpenAI-compatible chat-completions caller. Used by openai.ts and
// groq.ts (Groq's API is intentionally OpenAI-compatible).

import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import { LlmError } from "#/features/ai/internal/llm/client";
import { errBody } from "#/features/ai/internal/llm/helpers";

export async function callOpenAiCompatible(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
  base: string,
): Promise<ChatResponse> {
  const res = await cfg.fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: req.maxOutputTokens,
    }),
  });
  if (!res.ok) throw new LlmError(await errBody(res), res.status);
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  return {
    content,
    model: body.model ?? model,
    usage: body.usage
      ? {
          prompt_tokens: body.usage.prompt_tokens ?? 0,
          completion_tokens: body.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
