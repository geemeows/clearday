import { describe, expect, it, vi } from "vitest";
import {
  type ExchangeEnv,
  ExchangeError,
  exchangeCode,
  type FetchLike,
  redirectUri,
} from "#/lib/oauth-exchange";

const env: ExchangeEnv = {
  GITHUB_CLIENT_ID: "gh-id",
  GITHUB_CLIENT_SECRET: "gh-secret",
  GOOGLE_CLIENT_ID: "go-id",
  GOOGLE_CLIENT_SECRET: "go-secret",
  SLACK_CLIENT_ID: "sl-id",
  SLACK_CLIENT_SECRET: "sl-secret",
  AUTH_PROXY_URL: "https://auth.example.com",
};

const okJson = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

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

describe("exchangeCode — github", () => {
  it("posts code+secret to github and normalizes the response", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      expect(url).toBe("https://github.com/login/oauth/access_token");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("client_id")).toBe("gh-id");
      expect(params.get("client_secret")).toBe("gh-secret");
      expect(params.get("code")).toBe("xyz");
      expect(params.get("redirect_uri")).toBe(
        "https://auth.example.com/callback/github",
      );
      return okJson({
        access_token: "ghu_abc",
        scope: "repo,read:user",
        token_type: "bearer",
      });
    });
    const record = await exchangeCode("github", "xyz", env, fetchImpl);
    expect(record.provider).toBe("github");
    expect(record.access_token).toBe("ghu_abc");
    expect(record.scopes).toEqual(["repo", "read:user"]);
    expect(record.refresh_token).toBeNull();
    expect(record.expires_at).toBeNull();
  });

  it("throws ExchangeError when github returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "bad_verification_code", error_description: "bad" });
    await expect(exchangeCode("github", "xyz", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});

describe("exchangeCode — google", () => {
  it("normalizes a successful google token response with refresh_token", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("redirect_uri")).toBe(
        "https://auth.example.com/callback/google",
      );
      return okJson({
        access_token: "ya29.x",
        refresh_token: "1//rt",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.readonly openid",
        token_type: "Bearer",
        id_token: "id.tok",
      });
    };
    const record = await exchangeCode("google", "code123", env, fetchImpl);
    expect(record.access_token).toBe("ya29.x");
    expect(record.refresh_token).toBe("1//rt");
    expect(record.scopes).toContain("openid");
    expect(record.expires_at).toBeTruthy();
    expect(record.metadata).toEqual({ id_token: "id.tok" });
  });

  it("throws ExchangeError on google failure", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(
      exchangeCode("google", "code123", env, fetchImpl),
    ).rejects.toThrow(ExchangeError);
  });
});

describe("exchangeCode — slack", () => {
  it("normalizes a successful slack oauth.v2.access response", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://slack.com/api/oauth.v2.access");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("client_id")).toBe("sl-id");
      return okJson({
        ok: true,
        access_token: "xoxb-bot-token",
        scope: "chat:write,channels:read",
        team: { id: "T1", name: "Acme" },
        authed_user: { id: "U1", access_token: "xoxp-user", scope: "im:write" },
      });
    };
    const record = await exchangeCode("slack", "c", env, fetchImpl);
    expect(record.access_token).toBe("xoxb-bot-token");
    expect(record.account_id).toBe("U1");
    expect(record.scopes).toEqual(["chat:write", "channels:read"]);
    expect(record.metadata).toMatchObject({ team: { id: "T1" } });
  });

  it("throws when slack returns ok:false", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ ok: false, error: "invalid_code" });
    await expect(exchangeCode("slack", "c", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});
