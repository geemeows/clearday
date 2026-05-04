import { describe, expect, it, vi } from "vitest";
import {
  buildConnectUrl,
  completeOnboarding,
  getOnboardingStatus,
} from "#/lib/onboarding-api";

describe("getOnboardingStatus", () => {
  it("returns onboarded_at + connected count + auth proxy URL", async () => {
    const status = await getOnboardingStatus({
      loadOnboardedAt: async () => "2026-05-04T12:00:00.000Z",
      countConnectedProviders: async () => 2,
      authProxyUrl: "https://auth.example.com",
    });
    expect(status).toEqual({
      onboarded_at: "2026-05-04T12:00:00.000Z",
      providers_connected: 2,
      auth_proxy_url: "https://auth.example.com",
    });
  });

  it("returns null/0/null when fresh deployment", async () => {
    const status = await getOnboardingStatus({
      loadOnboardedAt: async () => null,
      countConnectedProviders: async () => 0,
      authProxyUrl: null,
    });
    expect(status).toEqual({
      onboarded_at: null,
      providers_connected: 0,
      auth_proxy_url: null,
    });
  });
});

describe("completeOnboarding", () => {
  it("stamps now() and persists it", async () => {
    const setOnboardedAt = vi.fn(async () => {});
    const out = await completeOnboarding({
      setOnboardedAt,
      now: () => new Date("2026-05-04T15:00:00.000Z"),
    });
    expect(out).toEqual({
      ok: true,
      onboarded_at: "2026-05-04T15:00:00.000Z",
    });
    expect(setOnboardedAt).toHaveBeenCalledWith("2026-05-04T15:00:00.000Z");
  });
});

describe("buildConnectUrl", () => {
  it("builds the auth-proxy /start URL for known providers", () => {
    expect(buildConnectUrl("github", "https://auth.example.com")).toEqual({
      ok: true,
      url: "https://auth.example.com/start/github",
    });
  });

  it("strips a trailing slash on the proxy URL", () => {
    expect(buildConnectUrl("slack", "https://auth.example.com/")).toEqual({
      ok: true,
      url: "https://auth.example.com/start/slack",
    });
  });

  it("rejects unknown providers", () => {
    const out = buildConnectUrl("evil", "https://auth.example.com");
    expect(out.ok).toBe(false);
  });

  it("errors when AUTH_PROXY_URL is not set", () => {
    const out = buildConnectUrl("github", null);
    expect(out.ok).toBe(false);
  });
});
