// The AI feature's public surface. The ONE callable: askAi.
//
// Internals (LLM dispatch, budget metering, redaction, key crypto, per-LLM
// modules) are deliberately not re-exported. Use-case features (briefing,
// draft-reply, ask-ai) import askAi from here.

export {
  AiCallRefused,
  type AiCallRequest,
  type AiCallResult,
  type AiCallSettings,
  askAi,
  type RunAiCallDeps,
} from "#/features/ai/internal/client";
