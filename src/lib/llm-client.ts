// Provider-agnostic LLM client. Pure module: pass in `{ provider, apiKey,
// fetch, defaultModel?, baseUrl? }` and call `chat({ messages, model? })`.
//
// Backends: Anthropic, OpenAI, Gemini, Groq (OpenAI-compatible), Ollama.
// Each backend is normalized to one response shape so callers (morning
// briefing, ask-ai, draft replies) don't branch on provider.
//
// No streaming in v1 — every backend is buffered. No tool calls. No
// system-message-as-first-user reshaping; if the caller wants a system
// prompt they pass `{ role: 'system', ... }` and we route it correctly.

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

export type LlmProvider = "anthropic" | "openai" | "gemini" | "groq" | "ollama";

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
  switch (cfg.provider) {
    case "anthropic":
      return callAnthropic(req, cfg, model);
    case "openai":
      return callOpenAi(req, cfg, model);
    case "gemini":
      return callGemini(req, cfg, model);
    case "groq":
      return callGroq(req, cfg, model);
    case "ollama":
      return callOllama(req, cfg, model);
  }
}

/** Tiny prompt for the "Test connection" button. */
export const TEST_PROMPT: ChatMessage[] = [
  { role: "user", content: "Reply with the single word: OK" },
];

// ---------------- Anthropic ----------------

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

// ---------------- OpenAI / Groq (OpenAI-compatible) ----------------

async function callOpenAi(
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

async function callGroq(
  req: ChatRequest,
  cfg: LlmConfig,
  model: string,
): Promise<ChatResponse> {
  return callOpenAiCompatible(
    req,
    cfg,
    model,
    cfg.baseUrl ?? "https://api.groq.com/openai/v1",
  );
}

async function callOpenAiCompatible(
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

// ---------------- Gemini ----------------

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

// ---------------- Ollama ----------------

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

// ---------------- helpers ----------------

function splitSystem(messages: ChatMessage[]): {
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

async function errBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return `LLM HTTP ${res.status}: ${text.slice(0, 400)}`;
  } catch {
    return `LLM HTTP ${res.status}`;
  }
}
