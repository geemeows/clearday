import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import { LlmError } from "#/features/ai/internal/llm/client";
import { errBody } from "#/features/ai/internal/llm/helpers";
import type { Llm } from "#/features/ai/internal/llm/llm";

async function callOllama(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  const base = cfg.baseUrl ?? "http://localhost:11434";
  const res = await cfg.fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      options: req.maxOutputTokens
        ? { num_predict: req.maxOutputTokens }
        : undefined,
    }),
  });
  if (!res.ok) throw new LlmError(await errBody(res), res.status);
  const body = (await res.json()) as {
    message?: { content?: string };
    model?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    content: body.message?.content ?? "",
    model: body.model ?? model,
    usage: {
      prompt_tokens: body.prompt_eval_count ?? 0,
      completion_tokens: body.eval_count ?? 0,
    },
  };
}

export const ollama: Llm = { id: "ollama", chat: callOllama };
