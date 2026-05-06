// Single source of truth for the displayed status of a Provider account
// (a row in `provider_accounts`). Called only from worker/signals-api.ts —
// the FE reads the final union off the wire and never re-derives.
//
// "Stale" is Slack-only today: connected but no successful poll within the
// last 24h. The threshold is hardcoded — only one provider exercises it,
// so a registry/config knob would be premature.

export type ProviderAccountStatus =
  | "ok"
  | "stale"
  | "rate_limited"
  | "auth_failed"
  | "neutral";

export const STALE_POLL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export type ProviderAccountStatusInput = {
  providerId: string;
  /** False when the user has no `provider_accounts` row for this provider. */
  rowPresent: boolean;
  /** Raw `provider_accounts.status` value; null is treated as ok. */
  rowStatus: string | null;
  lastPolledAt: string | null;
  now: number;
};

export function deriveProviderAccountStatus(
  input: ProviderAccountStatusInput,
): ProviderAccountStatus {
  if (!input.rowPresent) return "neutral";
  if (input.rowStatus === "rate_limited") return "rate_limited";
  if (input.rowStatus === "auth_failed") return "auth_failed";
  if (input.providerId === "slack" && input.lastPolledAt) {
    const ts = Date.parse(input.lastPolledAt);
    if (!Number.isNaN(ts) && input.now - ts > STALE_POLL_THRESHOLD_MS) {
      return "stale";
    }
  }
  return "ok";
}
