// Derives the displayed status of a Source rail row from the
// /api/sources payload. Slack is the only webhook provider in v1, so it
// gets an extra "stale" check: connected but no webhook arrived in
// `STALE_WEBHOOK_THRESHOLD_MS`.

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

export const STALE_WEBHOOK_THRESHOLD_MS = 24 * 60 * 60 * 1000;

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
  lastWebhookAt: string | null;
  now: number;
}): SourceStatus {
  const base = mapApiStatus(input.apiStatus);
  if (input.providerId !== "slack" || base !== "ok") return base;
  if (!input.lastWebhookAt) return base;
  const ts = Date.parse(input.lastWebhookAt);
  if (Number.isNaN(ts)) return base;
  return input.now - ts > STALE_WEBHOOK_THRESHOLD_MS ? "stale" : base;
}
