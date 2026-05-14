// Pure helper: maps a provider_accounts.id deterministically to a palette
// slot so every account renders a distinct, accessible event color.
// All foreground values are #ffffff which achieves ≥ 4.5:1 contrast (WCAG AA)
// against every background in the palette.

export type AccountColor = { background: string; foreground: string };

// Eight accessible slots. Add more if the palette ever needs extending —
// the modulo wraps gracefully.
const PALETTE: readonly AccountColor[] = [
  { background: "#1d4ed8", foreground: "#ffffff" }, // blue-700
  { background: "#047857", foreground: "#ffffff" }, // emerald-700
  { background: "#7c3aed", foreground: "#ffffff" }, // violet-600
  { background: "#c2410c", foreground: "#ffffff" }, // orange-700
  { background: "#0369a1", foreground: "#ffffff" }, // sky-700
  { background: "#9d174d", foreground: "#ffffff" }, // pink-800
  { background: "#15803d", foreground: "#ffffff" }, // green-700
  { background: "#b45309", foreground: "#ffffff" }, // amber-700
];

export const PALETTE_SIZE = PALETTE.length;

function hashAccountId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns `{ background, foreground }` for a calendar account.
 *
 * Pass `ordinal` (0-based insertion order across the deployment's linked
 * calendar accounts) to get stable per-account colors that don't depend on
 * the hash of the UUID. When `ordinal` is omitted, the id hash is used so
 * callers that don't track insertion order still get a deterministic color.
 */
export function accountColor(accountId: string, ordinal?: number): AccountColor {
  const idx =
    (ordinal !== undefined ? ordinal : hashAccountId(accountId)) %
    PALETTE_SIZE;
  return PALETTE[idx];
}
