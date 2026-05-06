import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptedBlob } from "#/shared/crypto";

describe("llm-crypto", () => {
  it("round-trips a plaintext API key", async () => {
    const secret = "deployment-hmac-secret-32-bytes-or-so";
    const blob = await encryptSecret("sk-ant-real-key", secret);
    expect(isEncryptedBlob(blob)).toBe(true);
    expect(blob).not.toContain("sk-ant-real-key");
    const back = await decryptSecret(blob, secret);
    expect(back).toBe("sk-ant-real-key");
  });

  it("emits a fresh IV each encryption (non-deterministic ciphertext)", async () => {
    const secret = "x".repeat(32);
    const a = await encryptSecret("hello", secret);
    const b = await encryptSecret("hello", secret);
    expect(a).not.toEqual(b);
  });

  it("fails to decrypt with the wrong secret", async () => {
    const blob = await encryptSecret("hello", "secret-A");
    await expect(decryptSecret(blob, "secret-B")).rejects.toBeDefined();
  });

  it("rejects malformed blobs", async () => {
    await expect(decryptSecret("plain-text", "x")).rejects.toThrow();
    await expect(decryptSecret("enc:v1:no-dot", "x")).rejects.toThrow();
  });
});
