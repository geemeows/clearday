import { describe, expect, it, vi } from "vitest";
import {
  type ExchangeEnv,
  ExchangeError,
  exchangeCode,
  type FetchLike,
  redirectUri,
  refreshGoogleToken,
  refreshJiraToken,
  refreshLinearToken,
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

describe("refreshGoogleToken", () => {
  it("posts grant_type=refresh_token and returns the new access_token", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://oauth2.googleapis.com/token");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("refresh_token")).toBe("1//rt");
      expect(params.get("client_id")).toBe("go-id");
      return okJson({
        access_token: "ya29.refreshed",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        token_type: "Bearer",
      });
    };
    const refreshed = await refreshGoogleToken("1//rt", env, fetchImpl);
    expect(refreshed.access_token).toBe("ya29.refreshed");
    expect(refreshed.expires_at).toBeTruthy();
    expect(refreshed.scopes).toContain(
      "https://www.googleapis.com/auth/calendar.readonly",
    );
  });

  it("throws ExchangeError on invalid_grant", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(refreshGoogleToken("rt", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
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

describe("exchangeCode — linear", () => {
  const linearEnv: ExchangeEnv = {
    ...env,
    LINEAR_CLIENT_ID: "lin-id",
    LINEAR_CLIENT_SECRET: "lin-secret",
  };

  it("posts code+secret to linear's token endpoint and normalizes the response", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://api.linear.app/oauth/token");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("client_id")).toBe("lin-id");
      expect(params.get("client_secret")).toBe("lin-secret");
      expect(params.get("code")).toBe("c");
      expect(params.get("grant_type")).toBe("authorization_code");
      expect(params.get("redirect_uri")).toBe(
        "https://auth.example.com/callback/linear",
      );
      return okJson({
        access_token: "lin_oauth_abc",
        refresh_token: "lin_rt",
        expires_in: 3600,
        scope: "read,write",
      });
    };
    const record = await exchangeCode("linear", "c", linearEnv, fetchImpl);
    expect(record.provider).toBe("linear");
    expect(record.access_token).toBe("lin_oauth_abc");
    expect(record.refresh_token).toBe("lin_rt");
    expect(record.scopes).toEqual(["read", "write"]);
    expect(record.expires_at).not.toBeNull();
  });

  it("throws when LINEAR_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(
      exchangeCode("linear", "c", env, fetchImpl),
    ).rejects.toBeInstanceOf(ExchangeError);
  });

  it("throws when linear returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(
      exchangeCode("linear", "c", linearEnv, fetchImpl),
    ).rejects.toThrow(ExchangeError);
  });
});

describe("exchangeCode — jira", () => {
  const jiraEnv: ExchangeEnv = {
    ...env,
    JIRA_CLIENT_ID: "atl-id",
    JIRA_CLIENT_SECRET: "atl-secret",
  };

  it("posts a JSON body to atlassian's token endpoint and normalizes the response", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://auth.atlassian.com/oauth/token");
      expect(init?.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      expect(body.client_id).toBe("atl-id");
      expect(body.client_secret).toBe("atl-secret");
      expect(body.code).toBe("c");
      expect(body.grant_type).toBe("authorization_code");
      expect(body.redirect_uri).toBe("https://auth.example.com/callback/jira");
      return okJson({
        access_token: "atl_access",
        refresh_token: "atl_rt",
        expires_in: 3600,
        scope: "read:jira-work offline_access",
      });
    };
    const record = await exchangeCode("jira", "c", jiraEnv, fetchImpl);
    expect(record.provider).toBe("jira");
    expect(record.access_token).toBe("atl_access");
    expect(record.refresh_token).toBe("atl_rt");
    expect(record.scopes).toEqual(["read:jira-work", "offline_access"]);
    expect(record.expires_at).not.toBeNull();
  });

  it("throws when JIRA_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(
      exchangeCode("jira", "c", env, fetchImpl),
    ).rejects.toBeInstanceOf(ExchangeError);
  });

  it("throws when jira returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(exchangeCode("jira", "c", jiraEnv, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});

describe("refreshLinearToken", () => {
  const linearEnv: ExchangeEnv = {
    ...env,
    LINEAR_CLIENT_ID: "lin-id",
    LINEAR_CLIENT_SECRET: "lin-secret",
  };

  it("posts grant_type=refresh_token and returns the rotated token", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://api.linear.app/oauth/token");
      const params = new URLSearchParams(init?.body ?? "");
      expect(params.get("grant_type")).toBe("refresh_token");
      expect(params.get("refresh_token")).toBe("lin_rt");
      expect(params.get("client_id")).toBe("lin-id");
      expect(params.get("client_secret")).toBe("lin-secret");
      return okJson({
        access_token: "lin_refreshed",
        refresh_token: "lin_rt_2",
        expires_in: 3600,
        scope: "read,write",
      });
    };
    const refreshed = await refreshLinearToken("lin_rt", linearEnv, fetchImpl);
    expect(refreshed.access_token).toBe("lin_refreshed");
    expect(refreshed.refresh_token).toBe("lin_rt_2");
    expect(refreshed.expires_at).toBeTruthy();
    expect(refreshed.scopes).toEqual(["read", "write"]);
  });

  it("returns refresh_token=null when linear does not rotate it", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ access_token: "lin_x", expires_in: 3600 });
    const refreshed = await refreshLinearToken("lin_rt", linearEnv, fetchImpl);
    expect(refreshed.refresh_token).toBeNull();
  });

  it("throws when LINEAR_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(
      refreshLinearToken("rt", env, fetchImpl),
    ).rejects.toBeInstanceOf(ExchangeError);
  });

  it("throws ExchangeError on invalid_grant", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(
      refreshLinearToken("rt", linearEnv, fetchImpl),
    ).rejects.toThrow(ExchangeError);
  });
});

describe("refreshJiraToken", () => {
  const jiraEnv: ExchangeEnv = {
    ...env,
    JIRA_CLIENT_ID: "atl-id",
    JIRA_CLIENT_SECRET: "atl-secret",
  };

  it("posts a JSON body to atlassian's token endpoint with the rotated refresh token", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe("https://auth.atlassian.com/oauth/token");
      expect(init?.headers["content-type"]).toBe("application/json");
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      expect(body.grant_type).toBe("refresh_token");
      expect(body.refresh_token).toBe("atl_rt");
      expect(body.client_id).toBe("atl-id");
      expect(body.client_secret).toBe("atl-secret");
      return okJson({
        access_token: "atl_refreshed",
        refresh_token: "atl_rt_2",
        expires_in: 3600,
        scope: "read:jira-work offline_access",
      });
    };
    const refreshed = await refreshJiraToken("atl_rt", jiraEnv, fetchImpl);
    expect(refreshed.access_token).toBe("atl_refreshed");
    expect(refreshed.refresh_token).toBe("atl_rt_2");
    expect(refreshed.scopes).toEqual(["read:jira-work", "offline_access"]);
  });

  it("throws when JIRA_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(refreshJiraToken("rt", env, fetchImpl)).rejects.toBeInstanceOf(
      ExchangeError,
    );
  });

  it("throws ExchangeError on invalid_grant", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(refreshJiraToken("rt", jiraEnv, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});
