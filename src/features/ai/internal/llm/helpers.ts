// Shared helpers used by every per-LLM module.

import type { ChatMessage } from "#/features/ai/internal/llm/client";

export function splitSystem(messages: ChatMessage[]): {
  system?: string;
  conversation: ChatMessage[];
} {
  const systems = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const conversation = messages.filter((m) => m.role !== "system");
  return {
    system: systems.length > 0 ? systems.join("\n\n") : undefined,
    conversation,
  };
}

export async function errBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return `LLM HTTP ${res.status}: ${text.slice(0, 400)}`;
  } catch {
    return `LLM HTTP ${res.status}`;
  }
}
