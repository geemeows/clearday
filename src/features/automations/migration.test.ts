// Migration semantic-equivalence test (issue #89, AC: "migration test
// asserting semantic equivalence of migrated automations against fixture
// Signals").
//
// The 0021 migration carries `inbox_rules` rows over to `automations` with
// `trigger_kind = 'signal_ingested'`, predicates moved verbatim, and three
// effect-type renames (`auto_dismiss` → `dismiss`, `priority` →
// `set_priority`, `channels` → `set_channels`). This test mirrors the SQL
// rewrite in TS and asserts that planning the migrated Automation against
// representative Signals produces the same column-level outcomes the old
// inbox-rules engine would have produced for those same effects.

import { describe, expect, it } from "vitest";
import type { AlertChannel } from "#/features/alerts/dispatcher";
import {
  type Automation,
  applyAutomationsToSignal,
} from "#/features/automations/engine";
import type { Signal } from "#/shared/signal";

type LegacyEffect =
  | { type: "auto_dismiss" }
  | { type: "snooze"; minutes: number }
  | { type: "tag"; tag: string }
  | { type: "priority"; value: "low" | "high" }
  | { type: "channels"; channels: string[] };

type LegacyRule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: { predicates: Automation["predicates"] };
  action: { effects: LegacyEffect[] };
};

// 1:1 with the SQL rewrite in 0021_automations.sql.
function migrateLegacyRule(rule: LegacyRule): Automation {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    trigger_kind: "signal_ingested",
    predicates: rule.match.predicates,
    actions: rule.action.effects.map((e): Automation["actions"][number] => {
      switch (e.type) {
        case "auto_dismiss":
          return { type: "dismiss" };
        case "snooze":
          return { type: "snooze", minutes: e.minutes };
        case "tag":
          return { type: "tag", tag: e.tag };
        case "priority":
          return { type: "set_priority", value: e.value };
        case "channels":
          return {
            type: "set_channels",
            channels: e.channels as AlertChannel[],
          };
        default:
          throw new Error(
            `unknown legacy effect ${(e as { type: string }).type}`,
          );
      }
    }),
  };
}

function fixtureSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    provider: "github",
    kind: "pr_review_requested",
    source_id: "pr-1",
    title: "feat: x",
    url: null,
    payload: { author: "alice" },
    requires_action: true,
    source_created_at: "2026-05-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("migration: inbox_rules → automations", () => {
  it("auto_dismiss rule on a dependabot signal becomes a dismiss automation", () => {
    const legacy: LegacyRule = {
      id: "r-1",
      name: "drop deps",
      enabled: true,
      priority: 1,
      match: {
        predicates: [
          { type: "source_match", field: "author", equals: "dependabot" },
        ],
      },
      action: { effects: [{ type: "auto_dismiss" }] },
    };
    const migrated = migrateLegacyRule(legacy);
    const out = applyAutomationsToSignal(
      fixtureSignal({ payload: { author: "dependabot" } }),
      [migrated],
    );
    expect(out.dismissed).toBe(true);
    expect(out.matched_automation_ids).toEqual(["r-1"]);
  });

  it("priority rule becomes set_priority and the application carries it", () => {
    const legacy: LegacyRule = {
      id: "r-2",
      name: "boost mentions",
      enabled: true,
      priority: 1,
      match: { predicates: [{ type: "kind", kind: "mention" }] },
      action: { effects: [{ type: "priority", value: "high" }] },
    };
    const migrated = migrateLegacyRule(legacy);
    expect(migrated.actions).toEqual([{ type: "set_priority", value: "high" }]);
    const out = applyAutomationsToSignal(fixtureSignal({ kind: "mention" }), [
      migrated,
    ]);
    expect(out.priority).toBe("high");
  });

  it("channels rule becomes set_channels and survives the channel set", () => {
    const legacy: LegacyRule = {
      id: "r-3",
      name: "route DMs to push",
      enabled: true,
      priority: 1,
      match: { predicates: [{ type: "kind", kind: "dm" }] },
      action: {
        effects: [{ type: "channels", channels: ["web_push", "email"] }],
      },
    };
    const migrated = migrateLegacyRule(legacy);
    const out = applyAutomationsToSignal(fixtureSignal({ kind: "dm" }), [
      migrated,
    ]);
    expect(out.channels).toEqual(["web_push", "email"]);
  });

  it("snooze + tag effects survive verbatim", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const legacy: LegacyRule = {
      id: "r-4",
      name: "snooze deps",
      enabled: true,
      priority: 1,
      match: {
        predicates: [
          { type: "source_match", field: "author", equals: "dependabot" },
        ],
      },
      action: {
        effects: [
          { type: "snooze", minutes: 60 },
          { type: "tag", tag: "deps" },
        ],
      },
    };
    const migrated = migrateLegacyRule(legacy);
    const out = applyAutomationsToSignal(
      fixtureSignal({ payload: { author: "dependabot" } }),
      [migrated],
      now,
    );
    expect(out.snoozed_until).toBe("2026-05-04T13:00:00.000Z");
    expect(out.tags).toEqual(["deps"]);
  });

  it("a representative legacy rule set produces the same matched outcome shape post-migration", () => {
    const now = new Date("2026-05-04T12:00:00.000Z");
    const legacy: LegacyRule[] = [
      {
        id: "drop-deps",
        name: "drop deps",
        enabled: true,
        priority: 1,
        match: {
          predicates: [
            { type: "source_match", field: "author", equals: "dependabot" },
          ],
        },
        action: { effects: [{ type: "auto_dismiss" }] },
      },
      {
        id: "boost-mentions",
        name: "boost mentions",
        enabled: true,
        priority: 2,
        match: { predicates: [{ type: "kind", kind: "mention" }] },
        action: { effects: [{ type: "priority", value: "high" }] },
      },
      {
        id: "route-dm",
        name: "route DMs",
        enabled: true,
        priority: 3,
        match: { predicates: [{ type: "kind", kind: "dm" }] },
        action: {
          effects: [{ type: "channels", channels: ["web_push"] }],
        },
      },
    ];
    const automations = legacy.map(migrateLegacyRule);

    expect(
      applyAutomationsToSignal(
        fixtureSignal({ payload: { author: "dependabot" } }),
        automations,
        now,
      ).dismissed,
    ).toBe(true);

    expect(
      applyAutomationsToSignal(
        fixtureSignal({ kind: "mention" }),
        automations,
        now,
      ).priority,
    ).toBe("high");

    expect(
      applyAutomationsToSignal(fixtureSignal({ kind: "dm" }), automations, now)
        .channels,
    ).toEqual(["web_push"]);
  });
});

describe("migration SQL", () => {
  it("contains the rename mapping for the three renamed effect types", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const sql = fs.readFileSync(
      path.resolve(here, "../../../supabase/migrations/0021_automations.sql"),
      "utf8",
    );
    expect(sql).toContain("'auto_dismiss', 'dismiss'");
    expect(sql).toContain("'priority', 'set_priority'");
    expect(sql).toContain("'channels', 'set_channels'");
    expect(sql).toMatch(/drop table if exists public\.inbox_rules/);
    expect(sql).toMatch(
      /create unique index if not exists automation_runs_event_unique_idx[\s\S]*automation_id, trigger_event_id/,
    );
  });
});
