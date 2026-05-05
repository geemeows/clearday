// Derives the displayed status of a Source rail row from the
// /api/sources payload. Slack gets an extra "stale" check: connected but
// no successful poll landed within `STALE_POLL_THRESHOLD_MS`.

export type SourceStatus =
  | "ok"
  | "stale"
  | "rate_limited"
  | "auth_failed"
  | "neutral";

export type ApiSourceStatus =
  | "connected"
  | "disconnected"
  | "rate_limited"
  | "auth_failed";

export const STALE_POLL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function mapApiStatus(api: ApiSourceStatus | undefined): SourceStatus {
  switch (api) {
    case "connected":
      return "ok";
    case "rate_limited":
      return "rate_limited";
    case "auth_failed":
      return "auth_failed";
    default:
      return "neutral";
  }
}

export function deriveSourceStatus(input: {
  providerId: string;
  apiStatus: ApiSourceStatus | undefined;
  lastPolledAt: string | null;
  now: number;
}): SourceStatus {
  const base = mapApiStatus(input.apiStatus);
  if (input.providerId !== "slack" || base !== "ok") return base;
  if (!input.lastPolledAt) return base;
  const ts = Date.parse(input.lastPolledAt);
  if (Number.isNaN(ts)) return base;
  return input.now - ts > STALE_POLL_THRESHOLD_MS ? "stale" : base;
}
