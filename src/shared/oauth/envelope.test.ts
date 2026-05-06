import { beforeAll, describe, expect, it } from "vitest";
import {
  type EnvelopeKeypair,
  generateEnvelopeKeypair,
  signEnvelope,
  verifyEnvelope,
} from "#/shared/oauth/envelope";

const BASE_PAYLOAD = {
  provider: "github",
  access_token: "gho_token",
  refresh_token: null,
  expires_at: null,
  scope: "repo",
  account_id: "user-123",
  backendUrl: "https://owner.example.com",
} as const;

describe("oauth-envelope", () => {
  let keys: EnvelopeKeypair;
  let otherKeys: EnvelopeKeypair;

  beforeAll(async () => {
    keys = await generateEnvelopeKeypair();
    otherKeys = await generateEnvelopeKeypair();
  });

  it("signs and verifies an envelope round-trip with only the public key", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, keys, { now: 1000 });
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.provider).toBe("github");
      expect(result.payload.access_token).toBe("gho_token");
      expect(result.payload.account_id).toBe("user-123");
      expect(result.payload.backendUrl).toBe("https://owner.example.com");
      expect(result.payload.exp).toBe(1000 + 120);
    }
  });

  it("rejects envelopes signed with a different keypair", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, otherKeys, { now: 1000 });
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an envelope whose payload was swapped post-sign", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, keys, { now: 1000 });
    const [, sig] = envelope.split(".");
    const forgedPayload = btoa(
      JSON.stringify({
        ...BASE_PAYLOAD,
        access_token: "attacker_token",
        exp: 1000 + 120,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = await verifyEnvelope(
      `${forgedPayload}.${sig}`,
      keys.publicKey,
      1000,
    );
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an envelope past its exp", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, keys, {
      now: 1000,
      ttlSeconds: 60,
    });
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000 + 61);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts an envelope at the edge of its exp", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, keys, {
      now: 1000,
      ttlSeconds: 60,
    });
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000 + 60);
    expect(result.ok).toBe(true);
  });

  it("clamps ttl to the 120s ceiling", async () => {
    const envelope = await signEnvelope(BASE_PAYLOAD, keys, {
      now: 1000,
      ttlSeconds: 9999,
    });
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.exp).toBe(1000 + 120);
    }
  });

  it("rejects malformed envelopes", async () => {
    const result = await verifyEnvelope(
      "not-an-envelope",
      keys.publicKey,
      1000,
    );
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an envelope whose payload is missing required fields", async () => {
    const envelope = await signEnvelope(
      // missing access_token via type-cast
      { ...BASE_PAYLOAD, access_token: undefined as unknown as string },
      keys,
      { now: 1000 },
    );
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000);
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("preserves optional fields (return_to, refresh_token, expires_at)", async () => {
    const envelope = await signEnvelope(
      {
        ...BASE_PAYLOAD,
        refresh_token: "rt_abc",
        expires_at: 1234567890,
        return_to: "/onboarding",
      },
      keys,
      { now: 1000 },
    );
    const result = await verifyEnvelope(envelope, keys.publicKey, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.refresh_token).toBe("rt_abc");
      expect(result.payload.expires_at).toBe(1234567890);
      expect(result.payload.return_to).toBe("/onboarding");
    }
  });
});
