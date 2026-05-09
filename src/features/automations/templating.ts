// Tiny pure templating helper used by external action bodies.
//
// Substitutes `{{signal.field}}` and `{{signal.payload.field}}` against a
// Signal. Unknown paths render as empty strings (no runtime errors), so a
// templated body that references a payload field absent from one Signal kind
// gracefully degrades when the same automation matches a different shape.
// Anything outside the `signal.*` namespace is left as-is so future contexts
// (`{{schedule.*}}`, `{{focus.*}}`) can layer in without breaking older
// templates.

import type { Signal } from "#/shared/signal";

const TOKEN_RE = /\{\{\s*([a-z][\w.-]*)\s*\}\}/gi;

const SIGNAL_DIRECT_FIELDS = new Set<keyof Signal>([
  "provider",
  "kind",
  "source_id",
  "title",
  "url",
  "requires_action",
  "source_created_at",
]);

export function renderTemplate(template: string, signal: Signal): string {
  return template.replace(TOKEN_RE, (_, path: string) => {
    const value = resolvePath(path, signal);
    return value === null || value === undefined ? "" : String(value);
  });
}

function resolvePath(path: string, signal: Signal): unknown {
  const parts = path.split(".");
  if (parts[0] !== "signal" || parts.length < 2) return "";
  if (parts[1] === "payload") {
    if (parts.length < 3) return "";
    let cur: unknown = signal.payload;
    for (let i = 2; i < parts.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        return "";
      }
      cur = (cur as Record<string, unknown>)[parts[i]];
    }
    return cur;
  }
  if (parts.length !== 2) return "";
  if (!SIGNAL_DIRECT_FIELDS.has(parts[1] as keyof Signal)) return "";
  return signal[parts[1] as keyof Signal];
}
