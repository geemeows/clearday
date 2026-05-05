import { describe, expect, it, vi } from "vitest";
import type { FetchLike, TokenRecord } from "#/lib/oauth-exchange";
import {
  handleOAuthExchange,
  type OAuthExchangeEnv,
  type PersistTokens,
} from "#/lib/oauth-exchange-handler";
import { signState } from "#/lib/oauth-state";

const env: OAuthExchangeEnv = {
  STATE_HMAC_SECRET: "test-secret",
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

const requestFor = async (params: Partial<Record<string, string>>) => {
  const u = new URL("https://owner.example.com/oauth/exchange");
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, v);
  }
  return new Request(u.toString());
};

describe("handleOAuthExchange", () => {
  it("verifies state, exchanges, persists, and redirects to settings", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const fetchImpl: FetchLike = vi.fn(async (url) => {
      if (url === "https://github.com/login/oauth/access_token") {
        return okJson({ access_token: "ghu_x", scope: "repo" });
      }
      return okJson({ id: 7, login: "octo" });
    });
    const persisted: TokenRecord[] = [];
    const persist: PersistTokens = async (r) => {
      persisted.push(r);
    };
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "github", state }),
      env,
      { fetch: fetchImpl, persist },
      1000,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/settings?connected=github");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].provider).toBe("github");
    expect(persisted[0].access_token).toBe("ghu_x");
    expect(persisted[0].account_id).toBe("7");
  });

  it("returns 400 when state is missing", async () => {
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "github" }),
      env,
      { fetch: vi.fn(), persist: vi.fn() },
      1000,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on tampered state (different secret)", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n" },
      "wrong",
      1000,
    );
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "github", state }),
      env,
      { fetch: vi.fn(), persist },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/bad_signature/);
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns 400 on expired state", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "github", state }),
      env,
      { fetch: vi.fn(), persist: vi.fn() },
      1000 + 601,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/expired/);
  });

  it("returns 400 for unknown providers", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "dropbox", state }),
      env,
      { fetch: vi.fn(), persist: vi.fn() },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/unknown provider/);
  });

  it("returns 502 when the provider rejects the code", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const fetchImpl: FetchLike = async () =>
      okJson({ error: "bad_verification_code" });
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      await requestFor({ code: "abc", provider: "github", state }),
      env,
      { fetch: fetchImpl, persist },
      1000,
    );
    expect(res.status).toBe(502);
    expect(persist).not.toHaveBeenCalled();
  });
});
