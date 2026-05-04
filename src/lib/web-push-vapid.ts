// VAPID (RFC 8292) authorization-header signer for Web Push deliveries.
//
// VAPID lets the push service identify the application server. We sign a
// short-lived ES256 JWT for the audience (the push endpoint's origin) and
// pass it in the Authorization header alongside the b64url public key so
// the push service can verify the signature against our registered key.
//
// Wire format (single-line):
//   Authorization: vapid t=<JWT>, k=<b64url(public key)>
//
// `publicKey` must be the uncompressed P-256 point (0x04 || x || y), 65 B,
// b64url-encoded (no padding) — the same value the browser was given when
// it generated the subscription.
// `privateKey` is the 32-byte scalar `d`, b64url-encoded.

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  /** Contact URL or mailto: per RFC 8292 §2 — push services use it for abuse follow-up. */
  subject: string;
};

export type VapidAuth = { authorization: string; cryptoKey: string };

const TEXT = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** RFC 7515: JOSE base64url-encoded JSON. */
function jsonB64url(obj: unknown): string {
  return b64urlEncode(TEXT.encode(JSON.stringify(obj)));
}

/**
 * Build the VAPID Authorization header for `endpoint`. The token's `aud` is
 * the endpoint's origin (scheme + host); `exp` is `now + ttlSeconds` clamped
 * to RFC 8292's 24h ceiling.
 */
export async function signVapidAuth(
  endpoint: string,
  config: VapidConfig,
  options: { now?: Date; ttlSeconds?: number } = {},
): Promise<VapidAuth> {
  const now = options.now ?? new Date();
  const ttl = Math.min(options.ttlSeconds ?? 12 * 60 * 60, 24 * 60 * 60);
  const exp = Math.floor(now.getTime() / 1000) + ttl;
  const aud = audienceFor(endpoint);

  const header = jsonB64url({ typ: "JWT", alg: "ES256" });
  const payload = jsonB64url({ aud, exp, sub: config.subject });
  const unsigned = `${header}.${payload}`;

  const key = await importVapidPrivateKey(config.publicKey, config.privateKey);
  const sigDer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    TEXT.encode(unsigned),
  );
  // Web Crypto returns raw r||s (64 bytes) for ECDSA P-256 — exactly what
  // JWT/JWS expects, so no DER conversion needed here.
  const jwt = `${unsigned}.${b64urlEncode(new Uint8Array(sigDer))}`;
  return {
    authorization: `vapid t=${jwt}, k=${config.publicKey}`,
    cryptoKey: config.publicKey,
  };
}

export function audienceFor(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

async function importVapidPrivateKey(
  publicKey: string,
  privateKey: string,
): Promise<CryptoKey> {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("vapid public key must be uncompressed P-256 (65 bytes)");
  }
  const d = b64urlDecode(privateKey);
  if (d.length !== 32) {
    throw new Error("vapid private key must be a 32-byte P-256 scalar");
  }
  const x = b64urlEncode(pub.slice(1, 33));
  const y = b64urlEncode(pub.slice(33, 65));
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: b64urlEncode(d),
      x,
      y,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Decode a VAPID JWT into its three parts for assertions in tests.
 * (Not exported as production behavior — the push service does this for us.)
 */
export function decodeJwtForTest(jwt: string): {
  header: unknown;
  payload: unknown;
  signatureBytes: number;
} {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("not a JWT");
  return {
    header: JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))),
    payload: JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))),
    signatureBytes: b64urlDecode(parts[2]).length,
  };
}
