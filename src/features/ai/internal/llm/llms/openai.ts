import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import type { Llm } from "#/features/ai/internal/llm/llm";
import { callOpenAiCompatible } from "#/features/ai/internal/llm/llms/openai-compatible";

function callOpenAi(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  return callOpenAiCompatible(
    req,
    cfg,
    model,
    cfg.baseUrl ?? "https://api.openai.com/v1",
  );
}

export const openai: Llm = { id: "openai", chat: callOpenAi };
