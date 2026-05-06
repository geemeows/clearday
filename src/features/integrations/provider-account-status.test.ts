import { describe, expect, it } from "vitest";
import {
  deriveProviderAccountStatus,
  STALE_POLL_THRESHOLD_MS,
} from "#/features/integrations/provider-account-status";

const NOW = Date.parse("2026-05-05T12:00:00Z");

describe("deriveProviderAccountStatus", () => {
  it("returns neutral when no row exists", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "github",
        rowPresent: false,
        rowStatus: null,
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("neutral");
  });

  it("maps a present row with non-special status to ok", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "github",
        rowPresent: true,
        rowStatus: "ok",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("treats null row status as ok when the row exists", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "linear",
        rowPresent: true,
        rowStatus: null,
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("surfaces rate_limited", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "github",
        rowPresent: true,
        rowStatus: "rate_limited",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("rate_limited");
  });

  it("surfaces auth_failed", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "github",
        rowPresent: true,
        rowStatus: "auth_failed",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("auth_failed");
  });

  it("returns ok for slack with a recent poll", () => {
    const recent = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(
      deriveProviderAccountStatus({
        providerId: "slack",
        rowPresent: true,
        rowStatus: "ok",
        lastPolledAt: recent,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("returns stale for slack when last poll is older than 24h", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveProviderAccountStatus({
        providerId: "slack",
        rowPresent: true,
        rowStatus: "ok",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("stale");
  });

  it("does not stale-out slack when no poll timestamp is known", () => {
    expect(
      deriveProviderAccountStatus({
        providerId: "slack",
        rowPresent: true,
        rowStatus: "ok",
        lastPolledAt: null,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("does not override auth_failed with stale", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveProviderAccountStatus({
        providerId: "slack",
        rowPresent: true,
        rowStatus: "auth_failed",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("auth_failed");
  });

  it("ignores poll timestamps for non-slack providers", () => {
    const stale = new Date(NOW - STALE_POLL_THRESHOLD_MS - 1).toISOString();
    expect(
      deriveProviderAccountStatus({
        providerId: "github",
        rowPresent: true,
        rowStatus: "ok",
        lastPolledAt: stale,
        now: NOW,
      }),
    ).toBe("ok");
  });
});
