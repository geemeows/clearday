import { describe, expect, it } from "vitest";
import { encryptWebPushPayload } from "#/features/alerts/channels/web-push/encrypt";
import { b64urlEncode } from "#/features/alerts/channels/web-push/vapid";

const TEXT = new TextEncoder();

async function generateUaSubscription() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const pubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    p256dh: b64urlEncode(pubRaw),
    auth: b64urlEncode(auth),
    authBytes: auth,
    pubBytes: pubRaw,
  };
}

async function decryptForTest(
  body: Uint8Array,
  uaPrivate: CryptoKey,
  uaPubBytes: Uint8Array,
  authBytes: Uint8Array,
): Promise<Uint8Array> {
  // Parse RFC 8188 header.
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const keyid = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);

  const asPub = await crypto.subtle.importKey(
    "raw",
    keyid as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: asPub },
      uaPrivate,
      256,
    ),
  );

  const prkInfo = concat(TEXT.encode("WebPush: info\0"), uaPubBytes, keyid);
  const ikm = await hkdf(authBytes, ecdh, prkInfo, 32);
  const cek = await hkdf(
    salt,
    ikm,
    TEXT.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    TEXT.encode("Content-Encoding: nonce\0"),
    12,
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const padded = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      ct as BufferSource,
    ),
  );
  // Trim last-record marker (0x02) and any trailing zero padding.
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0x00) end--;
  if (end === 0 || padded[end - 1] !== 0x02) {
    throw new Error("missing last-record marker (0x02)");
  }
  return padded.slice(0, end - 1);
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    ikm as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: info as BufferSource,
    },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("encryptWebPushPayload", () => {
  it("round-trips a JSON payload (encrypt -> decrypt yields original plaintext)", async () => {
    const sub = await generateUaSubscription();
    const plaintext = JSON.stringify({
      title: "Review me",
      body: "https://github.com/x/y/pull/1",
      url: "https://github.com/x/y/pull/1",
    });

    const body = await encryptWebPushPayload(plaintext, sub.p256dh, sub.auth);

    // Header shape: 16 (salt) + 4 (rs) + 1 (idlen) + 65 (keyid) + ciphertext+tag
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65 + 16);
    expect(body[20]).toBe(65);

    const decrypted = await decryptForTest(
      body,
      sub.privateKey,
      sub.pubBytes,
      sub.authBytes,
    );
    expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
  });

  it("encodes the negotiated record size as a 4-byte BE integer at offset 16", async () => {
    const sub = await generateUaSubscription();
    const body = await encryptWebPushPayload("hi", sub.p256dh, sub.auth, {
      rs: 4096,
    });
    const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    expect(dv.getUint32(16, false)).toBe(4096);
  });

  it("rejects a p256dh that is not a 65-byte uncompressed point", async () => {
    const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
    await expect(
      encryptWebPushPayload("x", b64urlEncode(new Uint8Array(64)), auth),
    ).rejects.toThrow(/uncompressed P-256/);
  });

  it("rejects an auth secret that is not 16 bytes", async () => {
    const sub = await generateUaSubscription();
    await expect(
      encryptWebPushPayload("x", sub.p256dh, b64urlEncode(new Uint8Array(8))),
    ).rejects.toThrow(/auth must be 16 bytes/);
  });

  it("rejects plaintext that exceeds rs - 17 bytes", async () => {
    const sub = await generateUaSubscription();
    const big = new Uint8Array(40);
    await expect(
      encryptWebPushPayload(big, sub.p256dh, sub.auth, { rs: 32 }),
    ).rejects.toThrow(/plaintext too large/);
  });
});
