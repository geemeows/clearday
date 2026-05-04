import { describe, expect, it } from "vitest";
import {
  audienceFor,
  b64urlDecode,
  b64urlEncode,
  decodeJwtForTest,
  signVapidAuth,
  type VapidConfig,
} from "#/lib/web-push-vapid";

async function generateVapidKeyPair(): Promise<VapidConfig> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as {
    x: string;
    y: string;
    d: string;
  };
  const x = b64urlDecode(jwk.x);
  const y = b64urlDecode(jwk.y);
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  pub.set(x, 1);
  pub.set(y, 33);
  return {
    publicKey: b64urlEncode(pub),
    privateKey: jwk.d,
    subject: "mailto:dev@example.com",
  };
}

describe("audienceFor", () => {
  it("strips path/query from the endpoint to scheme+host", () => {
    expect(audienceFor("https://fcm.googleapis.com/fcm/send/abc?x=1")).toBe(
      "https://fcm.googleapis.com",
    );
  });
});

describe("signVapidAuth", () => {
  it("produces a vapid Authorization header with t= JWT and k= public key", async () => {
    const config = await generateVapidKeyPair();
    const now = new Date("2026-05-04T12:00:00Z");
    const auth = await signVapidAuth(
      "https://fcm.googleapis.com/fcm/send/abc",
      config,
      { now, ttlSeconds: 3600 },
    );

    expect(auth.authorization.startsWith("vapid t=")).toBe(true);
    expect(auth.authorization).toContain(`, k=${config.publicKey}`);
    expect(auth.cryptoKey).toBe(config.publicKey);

    const jwt = auth.authorization.slice("vapid t=".length).split(",")[0];
    const decoded = decodeJwtForTest(jwt);
    expect(decoded.header).toEqual({ typ: "JWT", alg: "ES256" });
    const payload = decoded.payload as Record<string, unknown>;
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:dev@example.com");
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 3600);
    expect(decoded.signatureBytes).toBe(64);
  });

  it("clamps exp to the 24h ceiling", async () => {
    const config = await generateVapidKeyPair();
    const now = new Date("2026-05-04T12:00:00Z");
    const auth = await signVapidAuth("https://example.com/push/x", config, {
      now,
      ttlSeconds: 99999999,
    });
    const jwt = auth.authorization.slice("vapid t=".length).split(",")[0];
    const payload = decodeJwtForTest(jwt).payload as Record<string, unknown>;
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 24 * 60 * 60);
  });

  it("rejects malformed keys", async () => {
    await expect(
      signVapidAuth("https://example.com/push", {
        publicKey: b64urlEncode(new Uint8Array(10)),
        privateKey: b64urlEncode(new Uint8Array(32)),
        subject: "mailto:dev@example.com",
      }),
    ).rejects.toThrow(/uncompressed P-256/);

    const config = await generateVapidKeyPair();
    await expect(
      signVapidAuth("https://example.com/push", {
        publicKey: config.publicKey,
        privateKey: b64urlEncode(new Uint8Array(20)),
        subject: "mailto:dev@example.com",
      }),
    ).rejects.toThrow(/32-byte P-256 scalar/);
  });

  it("produces a verifiable signature against the public key", async () => {
    const config = await generateVapidKeyPair();
    const auth = await signVapidAuth("https://example.com/push/abc", config);
    const jwt = auth.authorization.slice("vapid t=".length).split(",")[0];
    const [h, p, s] = jwt.split(".");
    const pubBytes = b64urlDecode(config.publicKey);
    const x = b64urlEncode(pubBytes.slice(1, 33));
    const y = b64urlEncode(pubBytes.slice(33, 65));
    const verifyKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      b64urlDecode(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource,
    );
    expect(ok).toBe(true);
  });
});
