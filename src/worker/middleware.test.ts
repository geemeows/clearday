import { describe, expect, it, vi } from "vitest";
import {
  type GetUser,
  requireAllowedUser,
  type WorkerEnv,
} from "#/worker/middleware";

const env: WorkerEnv = {
  ALLOWED_EMAIL: "owner@example.com",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  STATE_HMAC_SECRET: "s",
  AUTH_PROXY_URL: "https://auth.example.com",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  SLACK_CLIENT_ID: "",
  SLACK_CLIENT_SECRET: "",
  SLACK_SIGNING_SECRET: "",
};

const reqWith = (auth?: string) =>
  new Request("https://example.com/api/me", {
    headers: auth ? { authorization: auth } : {},
  });

describe("requireAllowedUser", () => {
  it("returns 401 when no bearer header", async () => {
    const result = await requireAllowedUser(reqWith(), env, vi.fn());
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(401);
  });

  it("returns 401 when getUser returns null (invalid token)", async () => {
    const getUser: GetUser = vi.fn().mockResolvedValue(null);
    const result = await requireAllowedUser(reqWith("Bearer x"), env, getUser);
    expect("response" in result).toBe(true);
    if ("response" in result) expect(result.response.status).toBe(401);
  });

  it("returns 403 when email is not allowed", async () => {
    const getUser: GetUser = vi
      .fn()
      .mockResolvedValue({ id: "u", email: "stranger@example.com" });
    const result = await requireAllowedUser(reqWith("Bearer x"), env, getUser);
    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(403);
      const body = (await result.response.json()) as { error: string };
      expect(body.error).toMatch(/not authorized/i);
    }
  });

  it("returns the user when email matches", async () => {
    const getUser: GetUser = vi
      .fn()
      .mockResolvedValue({ id: "u", email: "owner@example.com" });
    const result = await requireAllowedUser(reqWith("Bearer x"), env, getUser);
    expect("user" in result).toBe(true);
    if ("user" in result) expect(result.user.email).toBe("owner@example.com");
  });
});
