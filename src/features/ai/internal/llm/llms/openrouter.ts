import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import type { Llm } from "#/features/ai/internal/llm/llm";
import { callOpenAiCompatible } from "#/features/ai/internal/llm/llms/openai-compatible";

function callOpenRouter(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  return callOpenAiCompatible(
    req,
    cfg,
    model,
    cfg.baseUrl ?? "https://openrouter.ai/api/v1",
  );
}

export const openrouter: Llm = { id: "openrouter", chat: callOpenRouter };
