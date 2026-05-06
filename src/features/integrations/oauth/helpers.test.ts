import { describe, expect, it } from "vitest";
import { redirectUri } from "#/features/integrations/oauth/helpers";
import { baseEnv as env } from "#/features/integrations/oauth/test-utils";

describe("redirectUri", () => {
  it("builds redirect uri from auth proxy url", () => {
    expect(redirectUri(env, "github")).toBe(
      "https://auth.example.com/callback/github",
    );
  });

  it("strips a trailing slash on AUTH_PROXY_URL", () => {
    expect(redirectUri({ ...env, AUTH_PROXY_URL: "https://a/" }, "slack")).toBe(
      "https://a/callback/slack",
    );
  });
});
