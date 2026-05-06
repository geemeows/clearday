import { describe, expect, it } from "vitest";
import { ExchangeError } from "#/features/integrations/oauth/errors";
import {
  baseEnv as env,
  okJson,
} from "#/features/integrations/oauth/test-utils";
import type { FetchLike } from "#/features/integrations/oauth/types";
import {
  exchangeGoogle,
  refreshGoogleToken,
} from "#/features/integrations/providers/google/oauth";

// {"sub":"1234567890"} base64url-encoded.
const subPayload = "eyJzdWIiOiIxMjM0NTY3ODkwIn0";
const validIdToken = `eyJhbGciOiJSUzI1NiJ9.${subPayload}.sig`;

describe("exchangeGoogle", () => {
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
    const record = await exchangeGoogle("code123", env, fetchImpl);
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
    await expect(exchangeGoogle("code123", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
  });

  it("throws ExchangeError when google omits refresh_token (offline access not granted)", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({
        access_token: "ya29.x",
        expires_in: 3600,
        scope: "openid",
        id_token: validIdToken,
      });
    await expect(exchangeGoogle("code123", env, fetchImpl)).rejects.toThrow(
      /refresh_token/,
    );
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
    await expect(exchangeGoogle("code123", env, fetchImpl)).rejects.toThrow(
      ExchangeError,
    );
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
    await expect(exchangeGoogle("code123", env, fetchImpl)).rejects.toThrow(
      /sub/,
    );
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
