import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKER_VERSION,
  getSelfHostInfo,
  OPTIONAL_ENV_VARS,
  REQUIRED_ENV_VARS,
  runHealthCheck,
  type SelfHostEnv,
} from "#/lib/self-host-api";

const FULL_ENV: SelfHostEnv = {
  ALLOWED_EMAIL: "owner@example.com",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  STATE_HMAC_SECRET: "hmac",
  AUTH_PROXY_URL: "https://auth.example.com",
  AI_KEY_SECRET: "ai",
  SLACK_SIGNING_SECRET: "s-sign",
  VAPID_PUBLIC_KEY: "vp",
  VAPID_PRIVATE_KEY: "vk",
  VAPID_SUBJECT: "mailto:owner@example.com",
  WORKER_VERSION: "abc1234",
};

describe("getSelfHostInfo", () => {
  it("reports presence-only for every known env var, never values", () => {
    const info = getSelfHostInfo(FULL_ENV, "https://worker.example.com");
    const required = info.env_vars.filter((v) => v.required);
    const optional = info.env_vars.filter((v) => !v.required);
    expect(required.map((v) => v.name).sort()).toEqual(
      [...REQUIRED_ENV_VARS].sort(),
    );
    expect(optional.map((v) => v.name).sort()).toEqual(
      [...OPTIONAL_ENV_VARS].sort(),
    );
    for (const v of info.env_vars) expect(v.present).toBe(true);
    // No env value should leak into the JSON view.
    const serialized = JSON.stringify(info);
    expect(serialized).not.toContain("anon");
    expect(serialized).not.toContain("service");
    expect(serialized).not.toContain("hmac");
    expect(serialized).not.toContain("s-sign");
  });

  it("flags missing required env vars as not present", () => {
    const env: SelfHostEnv = {
      ...FULL_ENV,
      AI_KEY_SECRET: undefined,
      AUTH_PROXY_URL: "",
    };
    const info = getSelfHostInfo(env, null);
    const aiKey = info.env_vars.find((v) => v.name === "AI_KEY_SECRET");
    const proxy = info.env_vars.find((v) => v.name === "AUTH_PROXY_URL");
    expect(aiKey?.present).toBe(false);
    expect(proxy?.present).toBe(false);
  });

  it("falls back to dev when WORKER_VERSION is unset or whitespace", () => {
    const a = getSelfHostInfo({ ...FULL_ENV, WORKER_VERSION: undefined }, null);
    const b = getSelfHostInfo({ ...FULL_ENV, WORKER_VERSION: "  " }, null);
    expect(a.worker_version).toBe(DEFAULT_WORKER_VERSION);
    expect(b.worker_version).toBe(DEFAULT_WORKER_VERSION);
  });

  it("surfaces worker_url, supabase_url, auth_proxy_url verbatim", () => {
    const info = getSelfHostInfo(FULL_ENV, "https://worker.example.com");
    expect(info.worker_url).toBe("https://worker.example.com");
    expect(info.supabase_url).toBe(FULL_ENV.SUPABASE_URL);
    expect(info.auth_proxy_url).toBe(FULL_ENV.AUTH_PROXY_URL);
  });
});

describe("runHealthCheck", () => {
  it("reports ok when all required envs present and DB reachable", async () => {
    const ping = vi.fn(async () => ({ ok: true }));
    const out = await runHealthCheck({ env: FULL_ENV, pingDatabase: ping });
    expect(out.ok).toBe(true);
    expect(out.checks.find((c) => c.name === "supabase")?.ok).toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("flags a missing required env var without short-circuiting the DB ping", async () => {
    const ping = vi.fn(async () => ({ ok: true }));
    const out = await runHealthCheck({
      env: { ...FULL_ENV, AI_KEY_SECRET: undefined },
      pingDatabase: ping,
    });
    expect(out.ok).toBe(false);
    const aiKey = out.checks.find((c) => c.name === "env:AI_KEY_SECRET");
    expect(aiKey?.ok).toBe(false);
    expect(aiKey?.detail).toMatch(/missing/i);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("surfaces a database error as a failed check, not a thrown rejection", async () => {
    const out = await runHealthCheck({
      env: FULL_ENV,
      pingDatabase: async () => {
        throw new Error("connection refused");
      },
    });
    const db = out.checks.find((c) => c.name === "supabase");
    expect(db?.ok).toBe(false);
    expect(db?.detail).toMatch(/connection refused/);
    expect(out.ok).toBe(false);
  });

  it("treats an explicit ok:false from pingDatabase as a failed check", async () => {
    const out = await runHealthCheck({
      env: FULL_ENV,
      pingDatabase: async () => ({ ok: false, error: "PGRST.." }),
    });
    expect(out.ok).toBe(false);
    expect(out.checks.find((c) => c.name === "supabase")?.detail).toBe(
      "PGRST..",
    );
  });
});
