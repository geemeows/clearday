// Envelope encryption for the user's BYO LLM API key. The Worker holds
// AI_KEY_SECRET (deployment secret); we HKDF-derive a 32-byte AES-GCM key
// from it and store ciphertext + IV in `ai_settings.api_key`.
//
// Wire format: `enc:v1:${b64url(iv)}.${b64url(ciphertext+tag)}`
// (the `enc:v1:` prefix lets us recognize encrypted blobs and migrate later).

const PREFIX = "enc:v1:";
const HKDF_INFO = new TextEncoder().encode("clearday-ai-settings-v1");

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const ikm = new TextEncoder().encode(secret);
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: HKDF_INFO,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  plaintext: string,
  secret: string,
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${PREFIX}${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

export async function decryptSecret(
  blob: string,
  secret: string,
): Promise<string> {
  if (!blob.startsWith(PREFIX)) {
    throw new Error("ciphertext is not a clearday encrypted blob");
  }
  const rest = blob.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) throw new Error("malformed ciphertext");
  const iv = b64urlDecode(rest.slice(0, dot));
  const ct = b64urlDecode(rest.slice(dot + 1));
  const key = await deriveKey(secret);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

export function isEncryptedBlob(s: string): boolean {
  return s.startsWith(PREFIX);
}
