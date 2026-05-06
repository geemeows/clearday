import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import { LlmError } from "#/features/ai/internal/llm/client";
import { errBody, splitSystem } from "#/features/ai/internal/llm/helpers";
import type { Llm } from "#/features/ai/internal/llm/llm";

async function callAnthropic(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  const base = cfg.baseUrl ?? "https://api.anthropic.com";
  const { system, conversation } = splitSystem(req.messages);
  const res = await cfg.fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxOutputTokens ?? 1024,
      system,
      messages: conversation.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });
  if (!res.ok) throw new LlmError(await errBody(res), res.status);
  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const content = (body.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  return {
    content,
    model: body.model ?? model,
    usage: body.usage
      ? {
          prompt_tokens: body.usage.input_tokens ?? 0,
          completion_tokens: body.usage.output_tokens ?? 0,
        }
      : undefined,
  };
}

export const anthropic: Llm = { id: "anthropic", chat: callAnthropic };
