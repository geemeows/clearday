import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TokenRecord } from "#/lib/oauth-exchange";
import {
  handleOAuthExchange,
  type OAuthExchangeEnv,
  type PersistTokens,
} from "#/lib/oauth-exchange-handler";
import {
  type EnvelopeKeypair,
  generateEnvelopeKeypair,
  signEnvelope,
} from "#/shared/oauth/envelope";

let keys: EnvelopeKeypair;
let env: OAuthExchangeEnv;

beforeAll(async () => {
  keys = await generateEnvelopeKeypair();
  env = { ENVELOPE_PUBLIC_KEY: keys.publicKey };
});

const requestFor = (envelope: string | null) => {
  const u = new URL("https://owner.example.com/oauth/exchange");
  if (envelope != null) u.searchParams.set("envelope", envelope);
  return new Request(u.toString());
};

describe("handleOAuthExchange", () => {
  it("verifies envelope, persists tokens, and 302s to /today", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        access_token: "ghu_x",
        refresh_token: null,
        expires_at: null,
        scope: "repo,read:user",
        account_id: "42",
        backendUrl: "https://owner.example.com",
      },
      keys,
      { now: 1000 },
    );
    const persisted: TokenRecord[] = [];
    const persist: PersistTokens = async (r) => {
      persisted.push(r);
    };
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/today");
    expect(persisted).toHaveLength(1);
    expect(persisted[0].provider).toBe("github");
    expect(persisted[0].access_token).toBe("ghu_x");
    expect(persisted[0].account_id).toBe("42");
    expect(persisted[0].scopes).toEqual(["repo", "read:user"]);
  });

  it("persists the envelope's metadata blob into the TokenRecord (e.g. slack team.id)", async () => {
    const envelope = await signEnvelope(
      {
        provider: "slack",
        access_token: "xoxp-user",
        refresh_token: null,
        expires_at: null,
        scope: "channels:read,im:read",
        account_id: "U1",
        backendUrl: "https://owner.example.com",
        metadata: { team: { id: "T1", name: "Acme" } },
      },
      keys,
      { now: 1000 },
    );
    const persisted: TokenRecord[] = [];
    const persist: PersistTokens = async (r) => {
      persisted.push(r);
    };
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000,
    );
    expect(res.status).toBe(302);
    expect(persisted[0].metadata).toEqual({ team: { id: "T1", name: "Acme" } });
  });

  it("redirects to envelope's return_to when supplied", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        access_token: "t",
        scope: "repo",
        account_id: "1",
        backendUrl: "https://owner.example.com",
        return_to: "/onboarding",
      },
      keys,
      { now: 1000 },
    );
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist: vi.fn() },
      1000,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/onboarding");
  });

  it("ignores absolute or protocol-relative return_to values", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        access_token: "t",
        scope: "repo",
        account_id: "1",
        backendUrl: "https://owner.example.com",
        return_to: "//evil.example.com/steal",
      },
      keys,
      { now: 1000 },
    );
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist: vi.fn() },
      1000,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/today");
  });

  it("returns 400 when envelope is missing", async () => {
    const res = await handleOAuthExchange(
      requestFor(null),
      env,
      { persist: vi.fn() },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing envelope/);
  });

  it("returns 400 when envelope signature does not verify", async () => {
    const otherKeys = await generateEnvelopeKeypair();
    const envelope = await signEnvelope(
      {
        provider: "github",
        access_token: "t",
        scope: "repo",
        account_id: "1",
        backendUrl: "https://owner.example.com",
      },
      otherKeys,
      { now: 1000 },
    );
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/bad_signature/);
    expect(persist).not.toHaveBeenCalled();
  });

  it("redirects to return_to with oauth_error params on an error envelope", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        backendUrl: "https://owner.example.com",
        return_to: "/onboarding",
        error: "access_denied",
        error_description: "user denied consent",
      },
      keys,
      { now: 1000 },
    );
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("/onboarding?")).toBe(true);
    const params = new URLSearchParams(location.split("?")[1]);
    expect(params.get("oauth_error")).toBe("access_denied");
    expect(params.get("oauth_provider")).toBe("github");
    expect(params.get("oauth_error_description")).toBe("user denied consent");
    expect(persist).not.toHaveBeenCalled();
  });

  it("redirects an error envelope without return_to to /today with oauth_error params", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        backendUrl: "https://owner.example.com",
        error: "exchange_failed",
        error_description: "github 400: bad_verification_code",
      },
      keys,
      { now: 1000 },
    );
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000,
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("/today?")).toBe(true);
    const params = new URLSearchParams(location.split("?")[1]);
    expect(params.get("oauth_error")).toBe("exchange_failed");
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns 400 when envelope has expired", async () => {
    const envelope = await signEnvelope(
      {
        provider: "github",
        access_token: "t",
        scope: "repo",
        account_id: "1",
        backendUrl: "https://owner.example.com",
      },
      keys,
      { now: 1000 },
    );
    const persist = vi.fn();
    const res = await handleOAuthExchange(
      requestFor(envelope),
      env,
      { persist },
      1000 + 121,
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/expired/);
    expect(persist).not.toHaveBeenCalled();
  });
});
