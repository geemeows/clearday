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
    const record = await exchangeCode("github", "xyz", env, fetchImpl);
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
    await expect(exchangeCode("github", "xyz", env, fetchImpl)).rejects.toThrow(
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
    await expect(exchangeCode("github", "xyz", env, fetchImpl)).rejects.toThrow(
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
    await expect(exchangeCode("github", "xyz", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});

describe("exchangeCode — google", () => {
  // {"sub":"1234567890"} base64url-encoded.
  const subPayload = "eyJzdWIiOiIxMjM0NTY3ODkwIn0";
  const validIdToken = `eyJhbGciOiJSUzI1NiJ9.${subPayload}.sig`;

  it("normalizes a successful google token response and derives account_id from the id_token sub", async () => {
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
        id_token: validIdToken,
      });
    };
    const record = await exchangeCode("google", "code123", env, fetchImpl);
    expect(record.access_token).toBe("ya29.x");
    expect(record.refresh_token).toBe("1//rt");
    expect(record.scopes).toContain("openid");
    expect(record.expires_at).toBeTruthy();
    expect(record.account_id).toBe("1234567890");
    expect(record.metadata).toEqual({ id_token: validIdToken });
  });

  it("throws ExchangeError on google 4xx", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(
      exchangeCode("google", "code123", env, fetchImpl),
    ).rejects.toThrow(ExchangeError);
  });

  it("throws ExchangeError when google omits refresh_token (offline access not granted)", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({
        access_token: "ya29.x",
        expires_in: 3600,
        scope: "openid",
        id_token: validIdToken,
      });
    await expect(
      exchangeCode("google", "code123", env, fetchImpl),
    ).rejects.toThrow(/refresh_token/);
  });

  it("throws ExchangeError when the id_token is malformed", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({
        access_token: "ya29.x",
        refresh_token: "1//rt",
        expires_in: 3600,
        scope: "openid",
        id_token: "not-a-jwt",
      });
    await expect(
      exchangeCode("google", "code123", env, fetchImpl),
    ).rejects.toThrow(ExchangeError);
  });

  it("throws ExchangeError when the id_token payload has no sub", async () => {
    // {"foo":"bar"} base64url, no sub.
    const noSub = "eyJmb28iOiJiYXIifQ";
    const fetchImpl: FetchLike = async () =>
      okJson({
        access_token: "ya29.x",
        refresh_token: "1//rt",
        expires_in: 3600,
        scope: "openid",
        id_token: `eyJhbGciOiJSUzI1NiJ9.${noSub}.sig`,
      });
    await expect(
      exchangeCode("google", "code123", env, fetchImpl),
    ).rejects.toThrow(/sub/);
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
  it("normalizes a slack v2 user-token response: stores authed_user.access_token, derives account_id from auth.test, preserves team.id, leaves refresh/expires null", async () => {
    const fetchImpl: FetchLike = vi.fn(async (url, init) => {
      if (url === "https://slack.com/api/oauth.v2.access") {
        const params = new URLSearchParams(init?.body ?? "");
        expect(params.get("client_id")).toBe("sl-id");
        expect(params.get("client_secret")).toBe("sl-secret");
        expect(params.get("code")).toBe("c");
        expect(params.get("redirect_uri")).toBe(
          "https://auth.example.com/callback/slack",
        );
        return okJson({
          ok: true,
          team: { id: "T1", name: "Acme" },
          authed_user: {
            id: "U-IGNORED",
            access_token: "xoxp-user-token",
            scope: "channels:read,groups:read,im:read,mpim:read,search:read",
          },
        });
      }
      if (url === "https://slack.com/api/auth.test") {
        expect(init?.method).toBe("POST");
        expect(init?.headers?.authorization).toBe("Bearer xoxp-user-token");
        return okJson({ ok: true, user_id: "U-FROM-AUTH-TEST", team_id: "T1" });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const record = await exchangeCode("slack", "c", env, fetchImpl);
    expect(record.access_token).toBe("xoxp-user-token");
    expect(record.account_id).toBe("U-FROM-AUTH-TEST");
    expect(record.refresh_token).toBeNull();
    expect(record.expires_at).toBeNull();
    expect(record.scopes).toEqual([
      "channels:read",
      "groups:read",
      "im:read",
      "mpim:read",
      "search:read",
    ]);
    expect(record.metadata).toEqual({ team: { id: "T1", name: "Acme" } });
  });

  it("throws ExchangeError including the slack error code when oauth.v2.access returns ok:false", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ ok: false, error: "invalid_code" });
    await expect(exchangeCode("slack", "c", env, fetchImpl)).rejects.toThrow(
      /invalid_code/,
    );
  });

  it("throws ExchangeError when authed_user.access_token is missing (no user-token scopes granted)", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({
        ok: true,
        team: { id: "T1" },
        authed_user: { id: "U1" },
      });
    await expect(exchangeCode("slack", "c", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });

  it("throws ExchangeError when auth.test fails", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === "https://slack.com/api/oauth.v2.access") {
        return okJson({
          ok: true,
          team: { id: "T1" },
          authed_user: { access_token: "xoxp-user", scope: "channels:read" },
        });
      }
      return okJson({ ok: false, error: "token_revoked" });
    };
    await expect(exchangeCode("slack", "c", env, fetchImpl)).rejects.toThrow(
      /token_revoked/,
    );
  });
});

describe("exchangeCode — linear", () => {
  const linearEnv: ExchangeEnv = {
    ...env,
    LINEAR_CLIENT_ID: "lin-id",
    LINEAR_CLIENT_SECRET: "lin-secret",
  };

  it("posts code+secret to linear's token endpoint, derives account_id from viewer, and normalizes the response", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      if (url === "https://api.linear.app/oauth/token") {
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
      }
      if (url === "https://api.linear.app/graphql") {
        expect(init?.method).toBe("POST");
        expect(init?.headers?.authorization).toBe("Bearer lin_oauth_abc");
        expect(init?.headers?.["content-type"]).toBe("application/json");
        expect(init?.body).toBe(JSON.stringify({ query: "{ viewer { id } }" }));
        return okJson({ data: { viewer: { id: "user_uuid_42" } } });
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const record = await exchangeCode("linear", "c", linearEnv, fetchImpl);
    expect(record.provider).toBe("linear");
    expect(record.access_token).toBe("lin_oauth_abc");
    expect(record.account_id).toBe("user_uuid_42");
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

  it("throws when the viewer query returns no id", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === "https://api.linear.app/oauth/token") {
        return okJson({ access_token: "lin_x", scope: "read" });
      }
      if (url === "https://api.linear.app/graphql") {
        return okJson({ data: { viewer: null } });
      }
      throw new Error(`unexpected url: ${url}`);
    };
    await expect(
      exchangeCode("linear", "c", linearEnv, fetchImpl),
    ).rejects.toThrow(/missing id/);
  });
});

describe("exchangeCode — jira", () => {
  const jiraEnv: ExchangeEnv = {
    ...env,
    JIRA_CLIENT_ID: "atl-id",
    JIRA_CLIENT_SECRET: "atl-secret",
  };

  it("posts a JSON body to atlassian's token endpoint, calls /me, and normalizes the response", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      if (url === "https://auth.atlassian.com/oauth/token") {
        expect(init?.headers["content-type"]).toBe("application/json");
        const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
        expect(body.client_id).toBe("atl-id");
        expect(body.client_secret).toBe("atl-secret");
        expect(body.code).toBe("c");
        expect(body.grant_type).toBe("authorization_code");
        expect(body.redirect_uri).toBe(
          "https://auth.example.com/callback/jira",
        );
        return okJson({
          access_token: "atl_access",
          refresh_token: "atl_rt",
          expires_in: 3600,
          scope: "read:jira-work offline_access",
        });
      }
      if (url === "https://api.atlassian.com/me") {
        expect(init?.headers.authorization).toBe("Bearer atl_access");
        return okJson({ account_id: "557058:abc-123", email: "u@x" });
      }
      throw new Error(`unexpected url: ${url}`);
    };
    const record = await exchangeCode("jira", "c", jiraEnv, fetchImpl);
    expect(record.provider).toBe("jira");
    expect(record.access_token).toBe("atl_access");
    expect(record.refresh_token).toBe("atl_rt");
    expect(record.account_id).toBe("557058:abc-123");
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

  it("throws when jira /me is missing account_id", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === "https://auth.atlassian.com/oauth/token") {
        return okJson({
          access_token: "atl_access",
          refresh_token: "atl_rt",
          expires_in: 3600,
          scope: "read:jira-work",
        });
      }
      if (url === "https://api.atlassian.com/me") {
        return okJson({ email: "u@x" });
      }
      throw new Error(`unexpected url: ${url}`);
    };
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
