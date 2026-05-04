// Privacy redactor. Pure module: given a string and a set of patterns,
// return the string with matches replaced by a placeholder.
//
// Default patterns target the things engineers most often want to keep
// out of an LLM provider's logs:
//
//   - fenced code blocks (``` ... ```)
//   - PR-diff content (lines beginning with + or -, when the buffer
//     looks like a unified diff)
//   - secrets-shaped strings: sk-... / Bearer ... / GitHub tokens
//     (gh[pousr]_…) / generic "API_KEY=value" env-var assignments
//   - filesystem-looking paths (/abs/paths and ./relative paths)
//
// Custom patterns added by the user in Settings are appended to this
// list. Each user pattern is treated as a JS regex source (case-
// insensitive, multiline). Invalid regexes are silently skipped — we
// never want a malformed pattern to wedge an AI call.

import type { ChatMessage } from "#/lib/llm-client";

export const PLACEHOLDER = "[redacted]";

export type RedactPattern = {
  name: string;
  regex: RegExp;
};

export const DEFAULT_PATTERNS: RedactPattern[] = [
  // Fenced code blocks (greedy across lines).
  { name: "code-fence", regex: /```[\s\S]*?```/g },
  // Anthropic / OpenAI style keys.
  { name: "sk-key", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  // GitHub PATs and OAuth tokens (gh[pousr]_…).
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  // `Bearer <token>` / `Authorization: Bearer …`.
  { name: "bearer", regex: /\bBearer\s+[A-Za-z0-9._\-+/=]{8,}/gi },
  // Env-var-style `NAME=value` assignments — common in pasted shell
  // output. Only triggers when the value is non-trivially long.
  {
    name: "env-assignment",
    regex: /\b([A-Z][A-Z0-9_]{2,})=([^\s"']{8,})/g,
  },
  // Absolute and home-relative filesystem paths.
  { name: "fs-path", regex: /(?:^|\s)(\/[^\s"']{2,}|~\/[^\s"']{2,})/g },
];

const DIFF_HEADER_RE = /^(diff --git|@@ |\+\+\+ |--- )/m;
const DIFF_LINE_RE = /^[+-][^+\-\n][^\n]*$/gm;

/**
 * Redact a single string. The default patterns are always applied; a
 * caller may pass additional regex sources from user settings.
 */
export function redact(text: string, customPatterns: string[] = []): string {
  let out = text;
  for (const p of DEFAULT_PATTERNS) {
    out = out.replace(p.regex, PLACEHOLDER);
  }
  if (DIFF_HEADER_RE.test(text)) {
    out = out.replace(DIFF_LINE_RE, PLACEHOLDER);
  }
  for (const src of customPatterns) {
    const re = compileUserPattern(src);
    if (re) out = out.replace(re, PLACEHOLDER);
  }
  return out;
}

/**
 * Apply `redact()` to every message in a conversation. Returns a new
 * array; never mutates the input.
 */
export function redactMessages(
  messages: ChatMessage[],
  customPatterns: string[] = [],
): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    content: redact(m.content, customPatterns),
  }));
}

function compileUserPattern(source: string): RegExp | null {
  try {
    return new RegExp(source, "gi");
  } catch {
    return null;
  }
}
