import { beforeAll, describe, expect, it, vi } from "vitest";
import { type AuthProxyEnv, handleAuthProxyRequest } from "#/lib/auth-proxy";
import {
  type EnvelopeKeypair,
  generateEnvelopeKeypair,
  verifyEnvelope,
} from "#/lib/oauth-envelope";
import type { FetchLike } from "#/lib/oauth-exchange";
import { signState } from "#/lib/oauth-state";

let keys: EnvelopeKeypair;
let env: AuthProxyEnv;

beforeAll(async () => {
  keys = await generateEnvelopeKeypair();
  env = {
    STATE_HMAC_SECRET: "test-secret",
    AUTH_PROXY_URL: "https://auth.example.com",
    GITHUB_CLIENT_ID: "gh-client-id",
    GITHUB_CLIENT_SECRET: "gh-client-secret",
    GOOGLE_CLIENT_ID: "go-id",
    GOOGLE_CLIENT_SECRET: "go-secret",
    SLACK_CLIENT_ID: "sl-id",
    SLACK_CLIENT_SECRET: "sl-secret",
    ENVELOPE_PRIVATE_KEY: keys.privateKey,
    ENVELOPE_PUBLIC_KEY: keys.publicKey,
  };
});

const okJson = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const githubFetch: FetchLike = async (url) => {
  if (url === "https://github.com/login/oauth/access_token") {
    return okJson({ access_token: "ghu_x", scope: "repo,read:user" });
  }
  if (url === "https://api.github.com/user") {
    return okJson({ id: 42, login: "octo" });
  }
  throw new Error(`unexpected url: ${url}`);
};

const callbackUrl = (provider: string, params: Record<string, string>) => {
  const u = new URL(`https://auth.example.com/callback/${provider}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u.toString());
};

describe("handleAuthProxyRequest /callback", () => {
  it("verifies state, exchanges code, and 302s with a signed envelope", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n1" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      { fetch: githubFetch },
      1000,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://owner.example.com");
    expect(location.pathname).toBe("/oauth/exchange");
    expect(location.searchParams.has("code")).toBe(false);
    expect(location.searchParams.has("state")).toBe(false);
    const envelope = location.searchParams.get("envelope") ?? "";
    expect(envelope).toBeTruthy();
    const verified = await verifyEnvelope(envelope, keys.publicKey, 1000);
    if (!verified.ok) throw new Error(`expected ok, got ${verified.reason}`);
    expect(verified.payload.provider).toBe("github");
    expect(verified.payload.access_token).toBe("ghu_x");
    expect(verified.payload.account_id).toBe("42");
    expect(verified.payload.scope).toBe("repo,read:user");
    expect(verified.payload.backendUrl).toBe("https://owner.example.com");
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
      { fetch: vi.fn() as unknown as FetchLike },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/unknown provider/);
  });

  it("returns 400 when state is missing", async () => {
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc" }),
      env,
      { fetch: vi.fn() as unknown as FetchLike },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing state/);
  });

  it("returns 400 when code is missing on a non-error callback", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n-no-code" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { state }),
      env,
      { fetch: vi.fn() as unknown as FetchLike },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing code/);
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
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/https/);
  });

  it("surfaces exchange failures as a 302 with a signed error envelope", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n6" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const failingFetch: FetchLike = async () =>
      okJson({ error: "bad_verification_code" });
    const res = await handleAuthProxyRequest(
      callbackUrl("github", { code: "abc", state }),
      env,
      { fetch: failingFetch },
      1000,
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://owner.example.com/oauth/exchange",
    );
    const envelope = location.searchParams.get("envelope") ?? "";
    const verified = await verifyEnvelope(envelope, keys.publicKey, 1000);
    if (!verified.ok) throw new Error(`expected ok, got ${verified.reason}`);
    expect(verified.payload.error).toBe("exchange_failed");
    expect(verified.payload.error_description).toMatch(/bad_verification_code/);
    expect(verified.payload.access_token).toBeUndefined();
  });

  it("surfaces provider ?error=access_denied as a 302 with a signed error envelope", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n7" },
      env.STATE_HMAC_SECRET,
      1000,
    );
    const fetchSpy = vi.fn() as unknown as FetchLike;
    const res = await handleAuthProxyRequest(
      callbackUrl("github", {
        state,
        error: "access_denied",
        error_description: "user denied consent",
      }),
      env,
      { fetch: fetchSpy },
      1000,
    );
    expect(res.status).toBe(302);
    expect(fetchSpy).not.toHaveBeenCalled();
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      "https://owner.example.com/oauth/exchange",
    );
    const envelope = location.searchParams.get("envelope") ?? "";
    const verified = await verifyEnvelope(envelope, keys.publicKey, 1000);
    if (!verified.ok) throw new Error(`expected ok, got ${verified.reason}`);
    expect(verified.payload.error).toBe("access_denied");
    expect(verified.payload.error_description).toBe("user denied consent");
    expect(verified.payload.provider).toBe("github");
  });

  it("returns 404 for non-callback / non-start paths", async () => {
    const res = await handleAuthProxyRequest(
      new Request("https://auth.example.com/health"),
      env,
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
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
      { fetch: vi.fn() as unknown as FetchLike },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/unknown_provider/);
  });
});
