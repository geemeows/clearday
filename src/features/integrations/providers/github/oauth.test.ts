import { describe, expect, it, vi } from "vitest";
import { ExchangeError } from "#/features/integrations/oauth/errors";
import {
  baseEnv as env,
  okJson,
} from "#/features/integrations/oauth/test-utils";
import type { FetchLike } from "#/features/integrations/oauth/types";
import { exchangeGithub } from "#/features/integrations/providers/github/oauth";

describe("exchangeGithub", () => {
  it("posts code+secret to github, calls /user, and normalizes the response", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      if (url === "https://github.com/login/oauth/access_token") {
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
      }
      if (url === "https://api.github.com/user") {
        expect(init?.method).toBe("GET");
        expect(init?.headers?.authorization).toBe("Bearer ghu_abc");
        expect(init?.headers?.["user-agent"]).toBeTruthy();
        return okJson({ id: 42, login: "octocat" });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const record = await exchangeGithub("xyz", env, fetchImpl);
    expect(record.provider).toBe("github");
    expect(record.access_token).toBe("ghu_abc");
    expect(record.account_id).toBe("42");
    expect(record.scopes).toEqual(["repo", "read:user"]);
    expect(record.refresh_token).toBeNull();
    expect(record.expires_at).toBeNull();
  });

  it("throws ExchangeError when github returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "bad_verification_code", error_description: "bad" });
    await expect(exchangeGithub("xyz", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });

  it("throws ExchangeError when github /user returns non-2xx", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === "https://github.com/login/oauth/access_token") {
        return okJson({ access_token: "ghu_abc", scope: "repo" });
      }
      return okJson({ message: "Bad credentials" }, 401);
    };
    await expect(exchangeGithub("xyz", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });

  it("throws ExchangeError when github /user response is missing id", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === "https://github.com/login/oauth/access_token") {
        return okJson({ access_token: "ghu_abc", scope: "repo" });
      }
      return okJson({ login: "octocat" });
    };
    await expect(exchangeGithub("xyz", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});
