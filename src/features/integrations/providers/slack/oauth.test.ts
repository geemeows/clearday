import { describe, expect, it, vi } from "vitest";
import { ExchangeError } from "#/features/integrations/oauth/errors";
import {
  baseEnv as env,
  okJson,
} from "#/features/integrations/oauth/test-utils";
import type { FetchLike } from "#/features/integrations/oauth/types";
import { exchangeSlack } from "#/features/integrations/providers/slack/oauth";

describe("exchangeSlack", () => {
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
            scope:
              "channels:read,groups:read,im:read,mpim:read,channels:history",
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
    const record = await exchangeSlack("c", env, fetchImpl);
    expect(record.access_token).toBe("xoxp-user-token");
    expect(record.account_id).toBe("U-FROM-AUTH-TEST");
    expect(record.refresh_token).toBeNull();
    expect(record.expires_at).toBeNull();
    expect(record.scopes).toEqual([
      "channels:read",
      "groups:read",
      "im:read",
      "mpim:read",
      "channels:history",
    ]);
    expect(record.metadata).toEqual({ team: { id: "T1", name: "Acme" } });
  });

  it("throws ExchangeError including the slack error code when oauth.v2.access returns ok:false", async () => {
    const fetchImpl: FetchLike = async () =>
      okJson({ ok: false, error: "invalid_code" });
    await expect(exchangeSlack("c", env, fetchImpl)).rejects.toThrow(
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
    await expect(exchangeSlack("c", env, fetchImpl)).rejects.toThrow(
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
    await expect(exchangeSlack("c", env, fetchImpl)).rejects.toThrow(
      /token_revoked/,
    );
  });
});
