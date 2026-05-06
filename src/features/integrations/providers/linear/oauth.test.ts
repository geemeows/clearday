import { describe, expect, it } from "vitest";
import { ExchangeError } from "#/features/integrations/oauth/errors";
import { baseEnv, okJson } from "#/features/integrations/oauth/test-utils";
import type {
  ExchangeEnv,
  FetchLike,
} from "#/features/integrations/oauth/types";
import {
  exchangeLinear,
  refreshLinearToken,
} from "#/features/integrations/providers/linear/oauth";

const env = baseEnv;
const linearEnv: ExchangeEnv = {
  ...env,
  LINEAR_CLIENT_ID: "lin-id",
  LINEAR_CLIENT_SECRET: "lin-secret",
};

describe("exchangeLinear", () => {
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
    const record = await exchangeLinear("c", linearEnv, fetchImpl);
    expect(record.provider).toBe("linear");
    expect(record.access_token).toBe("lin_oauth_abc");
    expect(record.account_id).toBe("user_uuid_42");
    expect(record.refresh_token).toBe("lin_rt");
    expect(record.scopes).toEqual(["read", "write"]);
    expect(record.expires_at).not.toBeNull();
  });

  it("throws when LINEAR_CLIENT_ID is not configured", async () => {
    const fetchImpl: FetchLike = async () => okJson({});
    await expect(exchangeLinear("c", env, fetchImpl)).rejects.toBeInstanceOf(
      ExchangeError,
    );
  });

  it("throws when linear returns an error body", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "invalid_grant" }, 400);
    await expect(exchangeLinear("c", linearEnv, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
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
    await expect(exchangeLinear("c", linearEnv, fetchImpl)).rejects.toThrow(
      /missing id/,
    );
  });
});

describe("refreshLinearToken", () => {
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
