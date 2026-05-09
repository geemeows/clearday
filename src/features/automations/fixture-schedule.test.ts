// Fixture-loading test (issue #99). Asserts the seeded sixth fixture row
// (Schedule trigger, "Daily 9am merged-PR roundup") lands in
// supabase/migrations/0023_*.sql with the expected trigger config, action
// shape, and dormant state.
//
// We assert against the migration text rather than an integration-level DB
// run because the rest of the test suite is unit-level and the fixture's
// shape is what matters for the picker — the real cron/executor wiring is
// already covered by engine.test.ts and orchestrator.test.ts.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  __dirname,
  "../../../supabase/migrations/0023_automations_seed_schedule_fixture.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("Schedule fixture seed (issue #99)", () => {
  it("inserts into public.automations", () => {
    expect(sql).toMatch(/insert into public\.automations/i);
  });

  it("uses the spec name", () => {
    expect(sql).toContain("'Daily 9am merged-PR roundup'");
  });

  it("registers as a disabled schedule automation", () => {
    expect(sql).toMatch(/'schedule'/);
    // enabled=false sits as a literal `false` in the column list.
    expect(sql).toMatch(/\bfalse\b/);
  });

  it("encodes the weekday-9am cron expression", () => {
    expect(sql).toContain("'cron'");
    expect(sql).toContain("'0 9 * * 1-5'");
  });

  it("seeds a post_message action targeting the user's self DM", () => {
    expect(sql).toContain("'post_message'");
    expect(sql).toContain("'self_dm'");
    expect(sql).toContain("{{schedule.merged_prs_summary}}");
  });

  it("guards against double-seeding on re-apply", () => {
    expect(sql).toMatch(/where not exists/i);
  });
});
