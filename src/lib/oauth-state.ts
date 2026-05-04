// Signed `state` for the OAuth flow. The per-user Worker mints a state
// when constructing an authorize URL; the project-run auth-proxy verifies
// it on the redirect callback. Both sides hold the same HMAC secret.
//
// Wire format: `${base64url(payloadJSON)}.${base64url(hmacSha256)}`.
// Implemented with Web Crypto so it runs unmodified on Cloudflare Workers
// and in Node-based tests.

const STATE_TTL_SECONDS = 600;
const ALG: HmacImportParams = { name: "HMAC", hash: "SHA-256" };

const enc = new TextEncoder();
const dec = new TextDecoder();

export type StatePayload = {
  userBackendUrl: string;
  nonce: string;
  iat: number;
};

export type VerifyResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export async function signState(
  payload: Omit<StatePayload, "iat">,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const full: StatePayload = { ...payload, iat: now };
  const payloadBytes = enc.encode(JSON.stringify(full));
  const key = await importKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign(ALG, key, payloadBytes as BufferSource),
  );
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

export async function verifyState(
  state: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = STATE_TTL_SECONDS,
): Promise<VerifyResult> {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = b64urlDecode(parts[0]);
    sigBytes = b64urlDecode(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    ALG,
    key,
    sigBytes as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  let payload: StatePayload;
  try {
    payload = JSON.parse(dec.decode(payloadBytes)) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.iat !== "number" ||
    typeof payload.userBackendUrl !== "string" ||
    typeof payload.nonce !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (now - payload.iat > ttlSeconds) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret) as BufferSource,
    ALG,
    false,
    ["sign", "verify"],
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
