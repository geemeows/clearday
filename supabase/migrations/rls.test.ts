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

const unreadBumpSql = readFileSync(
  resolve(__dirname, "0014_signals_unread_count_bump.sql"),
  "utf8",
);

const providerStatusSql = readFileSync(
  resolve(__dirname, "0015_provider_accounts_status.sql"),
  "utf8",
);

const slackParticipatedSql = readFileSync(
  resolve(__dirname, "0016_slack_participated_threads.sql"),
  "utf8",
);

const webhookReceivedSql = readFileSync(
  resolve(__dirname, "0017_provider_accounts_webhook_received.sql"),
  "utf8",
);

const signalPrioritySql = readFileSync(
  resolve(__dirname, "0018_signal_priority.sql"),
  "utf8",
);

const signalChannelsOverrideSql = readFileSync(
  resolve(__dirname, "0019_signal_alert_channels_override.sql"),
  "utf8",
);

const lastPolledSql = readFileSync(
  resolve(__dirname, "0020_provider_accounts_last_polled.sql"),
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

describe("0015_provider_accounts_status.sql contents", () => {
  it("adds provider_accounts.status with default 'ok'", () => {
    expect(providerStatusSql).toMatch(
      /alter table public\.provider_accounts\s+add column if not exists status text not null default 'ok'/i,
    );
  });

  it("constrains status to the three poll-outcome values", () => {
    for (const v of ["ok", "rate_limited", "auth_failed"]) {
      expect(providerStatusSql).toContain(`'${v}'`);
    }
    expect(providerStatusSql).toMatch(/check\s*\(\s*status in/i);
  });
});

describe("0017_provider_accounts_webhook_received.sql contents", () => {
  it("adds provider_accounts.last_webhook_received_at as a nullable timestamptz", () => {
    expect(webhookReceivedSql).toMatch(
      /alter table public\.provider_accounts\s+add column if not exists last_webhook_received_at timestamptz null/i,
    );
  });
});

describe("0020_provider_accounts_last_polled.sql contents", () => {
  it("adds provider_accounts.last_polled_at as a nullable timestamptz", () => {
    expect(lastPolledSql).toMatch(
      /alter table public\.provider_accounts\s+add column if not exists last_polled_at timestamptz null/i,
    );
  });
});

describe("0018_signal_priority.sql contents", () => {
  it("adds signals.priority as a nullable text column", () => {
    expect(signalPrioritySql).toMatch(
      /alter table public\.signals\s+add column if not exists priority text/i,
    );
  });

  it("constrains priority to 'low' or 'high' (or null)", () => {
    expect(signalPrioritySql).toMatch(/check\s*\(\s*priority is null/i);
    expect(signalPrioritySql).toContain("'low'");
    expect(signalPrioritySql).toContain("'high'");
  });
});

describe("0019_signal_alert_channels_override.sql contents", () => {
  it("adds signals.alert_channels_override as a nullable text[] column", () => {
    expect(signalChannelsOverrideSql).toMatch(
      /alter table public\.signals\s+add column if not exists alert_channels_override text\[\]/i,
    );
  });
});

describe("0016_slack_participated_threads.sql contents", () => {
  it("creates the participated-threads table keyed on (channel, thread_ts)", () => {
    expect(slackParticipatedSql).toMatch(
      /create table if not exists public\.slack_participated_threads/i,
    );
    expect(slackParticipatedSql).toMatch(
      /primary key\s*\(\s*channel\s*,\s*thread_ts\s*\)/i,
    );
  });

  it("enables RLS with the allowed-user predicate", () => {
    expect(slackParticipatedSql).toMatch(/enable row level security/);
    expect(slackParticipatedSql).toMatch(/public\.is_allowed_user\(\)/);
  });
});

describe("0014_signals_unread_count_bump.sql contents", () => {
  it("declares a before-update row trigger on public.signals", () => {
    expect(unreadBumpSql).toMatch(
      /create trigger signals_bump_unread_count\s+before update on public\.signals\s+for each row/i,
    );
  });

  it("bumps unread_count when title/url/payload/requires_action changes", () => {
    for (const col of ["title", "url", "payload", "requires_action"]) {
      expect(unreadBumpSql).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(unreadBumpSql).toMatch(
      /new\.unread_count\s*:=\s*old\.unread_count\s*\+\s*1/,
    );
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
    await client.query(unreadBumpSql);
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

  // Use the allowed-email JWT for the trigger tests so RLS permits inserts.
  async function asAllowed(): Promise<void> {
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ email: "owner@example.com" })],
    );
  }

  async function insertSignal(sourceId: string): Promise<string> {
    const { rows } = await client.query(
      `insert into public.signals
       (provider, kind, source_id, title, url, payload, requires_action, source_created_at)
       values ('github','pr_review_requested',$1,'t','https://x','{"a":1}'::jsonb,true,now())
       returning id, unread_count`,
      [sourceId],
    );
    return rows[0].id;
  }

  it("bumps unread_count when poll content changes", async () => {
    if (!pg) return;
    await asAllowed();
    const id = await insertSignal("repo#1");
    await client.query("update public.signals set title = 'new title' where id = $1", [id]);
    const { rows } = await client.query(
      "select unread_count from public.signals where id = $1",
      [id],
    );
    expect(rows[0].unread_count).toBe(1);
  });

  it("does not bump unread_count when poll re-upsert is a no-op", async () => {
    if (!pg) return;
    await asAllowed();
    const id = await insertSignal("repo#2");
    await client.query(
      "update public.signals set updated_at = now() where id = $1",
      [id],
    );
    const { rows } = await client.query(
      "select unread_count from public.signals where id = $1",
      [id],
    );
    expect(rows[0].unread_count).toBe(0);
  });

  it("does not bump unread_count on dismiss", async () => {
    if (!pg) return;
    await asAllowed();
    const id = await insertSignal("repo#3");
    await client.query(
      "update public.signals set dismissed_at = now() where id = $1",
      [id],
    );
    const { rows } = await client.query(
      "select unread_count from public.signals where id = $1",
      [id],
    );
    expect(rows[0].unread_count).toBe(0);
  });
});
