import { describe, expect, it } from "vitest";
import { signState, verifyState } from "#/shared/oauth/state";

const SECRET = "test-secret-please-change";

describe("oauth-state", () => {
  it("verifies a freshly signed state and recovers the payload", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n1" },
      SECRET,
      1000,
    );
    const result = await verifyState(state, SECRET, 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userBackendUrl).toBe("https://owner.example.com");
      expect(result.payload.nonce).toBe("n1");
      expect(result.payload.iat).toBe(1000);
    }
  });

  it("rejects state signed with a different secret", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n2" },
      SECRET,
      1000,
    );
    const result = await verifyState(state, "different-secret", 1000);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n3" },
      SECRET,
      1000,
    );
    const [, sig] = state.split(".");
    const forgedPayload = btoa(
      JSON.stringify({
        userBackendUrl: "https://attacker.example.com",
        nonce: "n3",
        iat: 1000,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = await verifyState(`${forgedPayload}.${sig}`, SECRET, 1000);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects state older than the TTL", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n4" },
      SECRET,
      1000,
    );
    const result = await verifyState(state, SECRET, 1000 + 601);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts state at the edge of the TTL window", async () => {
    const state = await signState(
      { userBackendUrl: "https://owner.example.com", nonce: "n5" },
      SECRET,
      1000,
    );
    const result = await verifyState(state, SECRET, 1000 + 600);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed states", async () => {
    const result = await verifyState("not-a-state", SECRET, 1000);
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });
});
