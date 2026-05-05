import { describe, expect, it } from "vitest";
import { handleAuthProxyRequest } from "#/lib/auth-proxy";
import { signState } from "#/lib/oauth-state";

const env = {
  STATE_HMAC_SECRET: "test-secret",
  AUTH_PROXY_URL: "https://auth.example.com",
  GITHUB_CLIENT_ID: "gh-client-id",
};

const callbackUrl = (provider: string, params: Record<string, string>) => {
  const u = new URL(`https://auth.example.com/callback/${provider}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u.toString());
};

describe("handleAuthProxyRequest", () => {
  it("redirects to <userBackendUrl>/oauth/exchange with code+provider on valid state", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n1" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      1000,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://owner.example.com");
    expect(location.pathname).toBe("/oauth/exchange");
    expect(location.searchParams.get("code")).toBe("abc");
    expect(location.searchParams.get("provider")).toBe("github");
    expect(location.searchParams.get("state")).toBe(state);
  });

  it.each([
    "linear",
    "jira",
  ])("redirects %s callbacks to <userBackendUrl>/oauth/exchange", async (provider) => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: `n-${provider}` },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl(provider, { code: "abc", state }),
      env,
      1000,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("provider")).toBe(provider);
  });

  it("rejects unknown providers with 400", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n2" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("dropbox", { code: "abc", state }),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/unknown provider/);
  });

  it("returns 400 when code or state is missing", async () => {
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc" }),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing code or state/);
  });

  it("rejects state signed with a different secret", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n3" },
      "wrong-secret",
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/bad_signature/);
  });

  it("rejects expired state", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n4" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      1000 + 601,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/expired/);
  });

  it("rejects non-https backend urls", async () => {
    const state = await signState(
      { userBackendUrl: "http://owner.example.com", nonce: "n5" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/https/);
  });

  it("returns 404 for non-callback / non-start paths", async () => {
    const res = await handleAuthProxyRequest(
      new Request("https://auth.example.com/health"),
      env,
      1000,
    );
    expect(res.status).toBe(404);
  });
});

describe("handleAuthProxyRequest /start", () => {
  it("302s to the github authorize URL with project client_id and signed state", async () => {
    const res = await handleAuthProxyRequest(
      new Request(
        "https://auth.example.com/start/github?backend=https://owner.example.com",
      ),
      env,
      1000,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(location.searchParams.get("client_id")).toBe("gh-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://auth.example.com/callback/github",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
  });

  it("400s when backend query param is missing", async () => {
    const res = await handleAuthProxyRequest(
      new Request("https://auth.example.com/start/github"),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing_backend/);
  });

  it("400s when backend is not https", async () => {
    const res = await handleAuthProxyRequest(
      new Request(
        "https://auth.example.com/start/github?backend=http://owner.example.com",
      ),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/non_https_backend/);
  });

  it("400s when provider is not in the scope table", async () => {
    const res = await handleAuthProxyRequest(
      new Request(
        "https://auth.example.com/start/google?backend=https://owner.example.com",
      ),
      env,
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/unknown_provider/);
  });
});
