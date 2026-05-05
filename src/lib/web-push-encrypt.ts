// RFC 8291 aes128gcm Web Push payload encryption (RFC 8188 single record).
//
// Wire shape produced for the POST body:
//   salt(16) || rs(4 BE) || idlen(1) || keyid (AS public, 65) || ciphertext+tag
//
// Caller must set request headers:
//   Content-Encoding: aes128gcm
//   Content-Type: application/octet-stream
//   Content-Length: <body.length>
//
// `p256dh` is the subscription's b64url uncompressed P-256 public key (65 B).
// `auth`   is the subscription's b64url 16-byte auth secret.

import { b64urlDecode } from "#/lib/web-push-vapid";

const TEXT = new TextEncoder();

export type EncryptOptions = {
  /** Override the random 16-byte salt (tests). */
  salt?: Uint8Array;
  /** Override the ephemeral AS keypair (tests). */
  ephemeralKeyPair?: CryptoKeyPair;
  /** Record size; RFC 8188 default is 4096. Plaintext + 17 bytes overhead must fit. */
  rs?: number;
};

export async function encryptWebPushPayload(
  plaintext: Uint8Array | string,
  p256dh: string,
  auth: string,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  const data =
    typeof plaintext === "string" ? TEXT.encode(plaintext) : plaintext;

  const uaPub = b64urlDecode(p256dh);
  if (uaPub.length !== 65 || uaPub[0] !== 0x04) {
    throw new Error(
      "subscription p256dh must be uncompressed P-256 (65 bytes)",
    );
  }
  const authSecret = b64urlDecode(auth);
  if (authSecret.length !== 16) {
    throw new Error("subscription auth must be 16 bytes");
  }

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error("salt must be 16 bytes");

  const rs = options.rs ?? 4096;
  if (data.length > rs - 17) {
    throw new Error(
      `plaintext too large for rs=${rs}: ${data.length} > ${rs - 17}`,
    );
  }

  const asKeyPair =
    options.ephemeralKeyPair ??
    (await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ));
  const asPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey),
  );
  if (asPubRaw.length !== 65) throw new Error("AS public key must be 65 bytes");

  const uaPubKey = await crypto.subtle.importKey(
    "raw",
    uaPub as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPubKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.4 key derivation.
  const prkInfo = concat(TEXT.encode("WebPush: info\0"), uaPub, asPubRaw);
  const ikm = await hkdf(authSecret, ecdh, prkInfo, 32);
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

  // Single-record padding: data || 0x02 (last-record marker).
  const padded = new Uint8Array(data.length + 1);
  padded.set(data, 0);
  padded[data.length] = 0x02;

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      padded as BufferSource,
    ),
  );

  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer, header.byteOffset, header.byteLength).setUint32(
    16,
    rs,
    false,
  );
  header[20] = 65;
  header.set(asPubRaw, 21);

  return concat(header, ct);
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
