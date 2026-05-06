import type {
  ChatRequest,
  ChatResponse,
  LlmConfig,
} from "#/features/ai/internal/llm/client";
import { LlmError } from "#/features/ai/internal/llm/client";
import { errBody, splitSystem } from "#/features/ai/internal/llm/helpers";
import type { Llm } from "#/features/ai/internal/llm/llm";

async function callGemini(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com";
  const { system, conversation } = splitSystem(req.messages);
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await cfg.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: conversation.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: req.maxOutputTokens
        ? { maxOutputTokens: req.maxOutputTokens }
        : undefined,
    }),
  });
  if (!res.ok) throw new LlmError(await errBody(res), res.status);
  const body = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };
  const content = (body.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  return {
    content,
    model,
    usage: body.usageMetadata
      ? {
          prompt_tokens: body.usageMetadata.promptTokenCount ?? 0,
          completion_tokens: body.usageMetadata.candidatesTokenCount ?? 0,
        }
      : undefined,
  };
}

export const gemini: Llm = { id: "gemini", chat: callGemini };
