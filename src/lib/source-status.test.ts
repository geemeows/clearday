import { describe, expect, it } from "vitest";
import {
  deriveSourceStatus,
  STALE_POLL_THRESHOLD_MS,
} from "#/lib/source-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

describe("deriveSourceStatus", () => {
  it("maps connected non-slack providers to ok", () => {
    expect(
      deriveSourceStatus({
        providerId: "github",
        apiStatus: "connected",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("returns ok for slack with a recent poll", () => {
    const recent = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastPolledAt: recent,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("returns stale for slack when last poll is older than 24h", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("does not stale-out slack when no poll timestamp is known", () => {
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "connected",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("does not override auth_failed with stale", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "slack",
        apiStatus: "auth_failed",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("auth_failed");
  });

  it("ignores poll timestamps for non-slack providers", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveSourceStatus({
        providerId: "github",
        apiStatus: "connected",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("ok");
  });
});
