// Ed25519-signed token envelope for the auth-proxy → user-Worker handoff.
//
// The auth-proxy holds the project's Ed25519 private key and signs a
// short-lived envelope containing a freshly-exchanged provider token plus
// metadata. Each user-Worker holds only the matching public key and verifies
// the envelope before persisting the token into `provider_accounts`.
//
// Asymmetric (rather than HMAC like `oauth-state`) so a user-Worker can
// verify without ever holding the proxy's signing key.
//
// Wire format: `${base64url(payloadJSON)}.${base64url(signature)}`.
// Implemented with Web Crypto so it runs unchanged on Cloudflare Workers
// and in Node-based tests.

const ENVELOPE_TTL_SECONDS = 120;
const ALG = "Ed25519" as const;

const enc = new TextEncoder();
const dec = new TextDecoder();

export type EnvelopePayload = {
  provider: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  scope: string;
  account_id: string;
  backendUrl: string;
  return_to?: string | null;
  exp: number;
};

export type EnvelopeKeypair = {
  /** b64url-encoded raw 32-byte Ed25519 public point. */
  publicKey: string;
  /** b64url-encoded raw 32-byte Ed25519 seed. */
  privateKey: string;
};

export type VerifyEnvelopeResult =
  | { ok: true; payload: EnvelopePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export async function generateEnvelopeKeypair(): Promise<EnvelopeKeypair> {
  const pair = (await crypto.subtle.generateKey({ name: ALG }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(
    await crypto.subtle.exportKey("raw", pair.publicKey),
  );
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    pair.privateKey,
  )) as JsonWebKey;
  if (!jwk.d) throw new Error("ed25519 private export missing d");
  return {
    publicKey: b64urlEncode(pub),
    privateKey: jwk.d, // already b64url-encoded per JWK spec
  };
}

export async function signEnvelope(
  payload: Omit<EnvelopePayload, "exp">,
  keys: EnvelopeKeypair,
  options: { now?: number; ttlSeconds?: number } = {},
): Promise<string> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.min(
    options.ttlSeconds ?? ENVELOPE_TTL_SECONDS,
    ENVELOPE_TTL_SECONDS,
  );
  const full: EnvelopePayload = { ...payload, exp: now + ttl };
  const payloadBytes = enc.encode(JSON.stringify(full));
  const key = await importPrivateKey(keys);
  const sig = new Uint8Array(
    await crypto.subtle.sign(ALG, key, payloadBytes as BufferSource),
  );
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

export async function verifyEnvelope(
  envelope: string,
  publicKey: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<VerifyEnvelopeResult> {
  const parts = envelope.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(parts[0]);
    sigBytes = b64urlDecode(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  let key: CryptoKey;
  try {
    key = await importPublicKey(publicKey);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const valid = await crypto.subtle.verify(
    ALG,
    key,
    sigBytes as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  let payload: EnvelopePayload;
  try {
    payload = JSON.parse(dec.decode(payloadBytes)) as EnvelopePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.exp !== "number" ||
    typeof payload.provider !== "string" ||
    typeof payload.access_token !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.account_id !== "string" ||
    typeof payload.backendUrl !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (now > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

async function importPrivateKey(keys: EnvelopeKeypair): Promise<CryptoKey> {
  // Ed25519 JWK requires both `d` (seed) and `x` (public point).
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "OKP",
      crv: "Ed25519",
      d: keys.privateKey,
      x: keys.publicKey,
      ext: true,
    },
    { name: ALG },
    false,
    ["sign"],
  );
}

async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const raw = b64urlDecode(publicKey);
  if (raw.length !== 32) {
    throw new Error("ed25519 public key must be 32 bytes");
  }
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: ALG },
    false,
    ["verify"],
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded =
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
