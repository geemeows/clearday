import { describe, expect, it } from "vitest";
import {
  deriveSourceStatus,
  STALE_WEBHOOK_THRESHOLD_MS,
} from "#/lib/source-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

describe("deriveSourceStatus", () => {
  it("maps connected non-slack providers to ok", () => {
    expect(
      deriveSourceStatus({
        providerId: "github",
        apiStatus: "connected",
        lastWebhookAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("returns ok for slack with a recent webhook", () => {
    const recent = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastWebhookAt: recent,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("returns stale for slack when last webhook is older than 24h", () => {
    const stale = new Date(NOW - STALE_WEBHOOK_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastWebhookAt: stale,
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("does not stale-out slack when no webhook timestamp is known", () => {
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastWebhookAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("does not override auth_failed with stale", () => {
    const stale = new Date(NOW - STALE_WEBHOOK_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "auth_failed",
        lastWebhookAt: stale,
        now: NOW,
      }),
    ).toBe("auth_failed");
  });

  it("ignores webhook timestamps for non-slack providers", () => {
    const stale = new Date(NOW - STALE_WEBHOOK_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "github",
        apiStatus: "connected",
        lastWebhookAt: stale,
        now: NOW,
      }),
    ).toBe("ok");
  });
});
