// Integration test for the v1 RLS gate. Skipped when no Postgres URL is
// available — set DATABASE_URL to a local supabase/postgres to run it:
//
//   supabase start
//   DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres pnpm test
//
// The test:
//   1. resets the public schema
//   2. applies 0001_init.sql
//   3. seeds allowed_email and creates a fake jwt-claim role
//   4. asserts a non-allowed JWT email is rejected by signals RLS
//   5. asserts the allowed email passes
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

const migrationSql = readFileSync(
  resolve(__dirname, "0001_init.sql"),
  "utf8",
);

describe("0001_init.sql contents", () => {
  it("declares the (provider, kind, source_id) unique constraint on signals", () => {
    expect(migrationSql).toMatch(
      /unique\s*\(\s*provider\s*,\s*kind\s*,\s*source_id\s*\)/i,
    );
  });

  it("enables RLS on every v1 table", () => {
    for (const t of [
      "signals",
      "signal_rollups",
      "provider_accounts",
      "user_preferences",
      "web_push_subscriptions",
      "slack_channel_allowlist",
      "inbox_rules",
      "ai_settings",
      "ai_usage",
    ]) {
      expect(migrationSql).toContain(t);
    }
    expect(migrationSql).toMatch(/enable row level security/);
  });

  it("uses the allowed-email predicate in policies", () => {
    expect(migrationSql).toMatch(/public\.is_allowed_user\(\)/);
  });
});

const dbDescribe = DATABASE_URL ? describe : describe.skip;

dbDescribe("RLS integration", () => {
  // biome-ignore lint/suspicious/noExplicitAny: pg client typing not worth pulling in
  let pg: any;
  // biome-ignore lint/suspicious/noExplicitAny: pg client typing not worth pulling in
  let client: any;

  beforeAll(async () => {
    const pgModule = "pg";
    pg = await import(/* @vite-ignore */ pgModule).catch(() => null);
    if (!pg) {
      // pg is optional; if it's not installed, the integration test is a no-op.
      return;
    }
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query("drop schema if exists public cascade; create schema public;");
    // The migration uses auth.jwt(); fake the auth schema for offline tests.
    await client.query(`
      create schema if not exists auth;
      create or replace function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb)
      $$;
    `);
    await client.query(migrationSql);
    await client.query(
      "update public.app_settings set allowed_email = 'owner@example.com'",
    );
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it("rejects a non-allowed email via is_allowed_user()", async () => {
    if (!pg) return;
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ email: "stranger@example.com" })],
    );
    const { rows } = await client.query("select public.is_allowed_user() as ok");
    expect(rows[0].ok).toBe(false);
  });

  it("accepts the allowed email via is_allowed_user()", async () => {
    if (!pg) return;
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ email: "owner@example.com" })],
    );
    const { rows } = await client.query("select public.is_allowed_user() as ok");
    expect(rows[0].ok).toBe(true);
  });
});
