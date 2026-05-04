// Pure email-equality check used by both the client and the Worker
// to enforce the single-user gate. Comparison is case-insensitive and
// trims surrounding whitespace; both inputs must be present and non-empty.
export function isAllowedEmail(
  candidate: string | null | undefined,
  allowed: string | null | undefined,
): boolean {
  if (!candidate || !allowed) return false;
  return candidate.trim().toLowerCase() === allowed.trim().toLowerCase();
}
