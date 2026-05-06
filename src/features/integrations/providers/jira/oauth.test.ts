import { describe, expect, it } from "vitest";
import { ExchangeError } from "#/features/integrations/oauth/errors";
import { baseEnv, okJson } from "#/features/integrations/oauth/test-utils";
import type {
  ExchangeEnv,
  FetchLike,
} from "#/features/integrations/oauth/types";
import {
  exchangeJira,
  refreshJiraToken,
} from "#/features/integrations/providers/jira/oauth";

const env = baseEnv;
const jiraEnv: ExchangeEnv = {
  ...env,
  JIRA_CLIENT_ID: "atl-id",
  JIRA_CLIENT_SECRET: "atl-secret",
};

describe("exchangeJira", () => {
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
    const record = await exchangeJira("c", jiraEnv, fetchImpl);
    expect(record.provider).toBe("jira");
    expect(record.access_token).toBe("atl_access");
    expect(record.refresh_token).toBe("atl_rt");
    expect(record.account_id).toBe("557058:abc-123");
    expect(record.scopes).toEqual(["read:jira-work", "offline_access"]);
    expect(record.expires_at).not.toBeNull();
  });

  it("throws when JIRA_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(exchangeJira("c", env, fetchImpl)).rejects.toBeInstanceOf(
      ExchangeError,
    );
  });

  it("throws when jira returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(exchangeJira("c", jiraEnv, fetchImpl)).rejects.toThrow(
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
    await expect(exchangeJira("c", jiraEnv, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });
});

describe("refreshJiraToken", () => {
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
