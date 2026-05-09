import { describe, expect, it } from "vitest";
import type { Account } from "#/features/integrations/accounts/store";
import {
  resolve,
  type ActionKind,
  type OriginatingSignalContext,
} from "./resolve";

function acct(overrides: Partial<Account> & { id: string; provider: string }): Account {
  return {
    id: overrides.id,
    provider: overrides.provider,
    account_id: overrides.account_id ?? `${overrides.provider}:${overrides.id}`,
    handle: overrides.handle ?? null,
    display_name: overrides.display_name ?? null,
    context: overrides.context ?? null,
    primary: overrides.primary ?? false,
    added_at: overrides.added_at ?? "2026-05-01T00:00:00.000Z",
  };
}

const KINDS: ActionKind[] = [
  "calendar-event-create",
  "calendar-event-edit",
  "draft-reply-send",
  "github-action",
];

describe("account-resolver", () => {
  it("returns the originating Signal's account as the smart default", () => {
    const work = acct({ id: "gh-work", provider: "github" });
    const personal = acct({ id: "gh-personal", provider: "github", primary: true });
    const signal: OriginatingSignalContext = {
      provider: "github",
      account_id: "gh-work",
    };
    const out = resolve({
      providerId: "github",
      actionKind: "draft-reply-send",
      originatingSignal: signal,
      accounts: [personal, work],
    });
    expect(out.mode).toBe("single");
    expect(out.accounts.map((a) => a.id)).toEqual(["gh-work"]);
  });

  it("falls back to the primary account when there is no Signal context", () => {
    const work = acct({ id: "gh-work", provider: "github" });
    const personal = acct({ id: "gh-personal", provider: "github", primary: true });
    for (const kind of KINDS) {
      const out = resolve({
        providerId: "github",
        actionKind: kind,
        accounts: [work, personal],
      });
      expect(out.mode).toBe("single");
      expect(out.accounts.map((a) => a.id)).toEqual(["gh-personal"]);
    }
  });

  it("returns the only available account for single-account providers regardless of context", () => {
    const only = acct({ id: "gh-only", provider: "github", primary: true });
    const otherProvider = acct({ id: "slack-1", provider: "slack", primary: true });
    const out = resolve({
      providerId: "github",
      actionKind: "draft-reply-send",
      originatingSignal: {
        provider: "github",
        account_id: "non-existent",
      },
      accounts: [only, otherProvider],
    });
    expect(out.mode).toBe("single");
    expect(out.accounts.map((a) => a.id)).toEqual(["gh-only"]);
  });

  it("ignores Signal context when its provider differs from the action's", () => {
    const a = acct({ id: "gh-a", provider: "github", primary: true });
    const b = acct({ id: "gh-b", provider: "github" });
    const out = resolve({
      providerId: "github",
      actionKind: "calendar-event-create",
      originatingSignal: { provider: "slack", account_id: "slack-1" },
      accounts: [a, b],
    });
    expect(out.mode).toBe("single");
    expect(out.accounts[0]?.id).toBe("gh-a");
  });

  it("ignores a Signal whose account_id no longer exists (tombstoned)", () => {
    const a = acct({ id: "gh-a", provider: "github", primary: true });
    const b = acct({ id: "gh-b", provider: "github" });
    const out = resolve({
      providerId: "github",
      actionKind: "draft-reply-send",
      originatingSignal: { provider: "github", account_id: "gh-removed" },
      accounts: [a, b],
    });
    expect(out.mode).toBe("single");
    expect(out.accounts[0]?.id).toBe("gh-a");
  });

  it("fans out Focus → Slack DND across every connected Slack account", () => {
    const a = acct({ id: "slack-a", provider: "slack", primary: true });
    const b = acct({ id: "slack-b", provider: "slack" });
    const c = acct({ id: "slack-c", provider: "slack" });
    const noise = acct({ id: "gh-1", provider: "github" });
    const out = resolve({
      providerId: "slack",
      actionKind: "focus-slack-dnd",
      accounts: [a, b, noise, c],
    });
    expect(out.mode).toBe("fanout");
    expect(out.accounts.map((a) => a.id).sort()).toEqual([
      "slack-a",
      "slack-b",
      "slack-c",
    ]);
  });

  it("returns an empty single result when the provider has no connected accounts", () => {
    const out = resolve({
      providerId: "github",
      actionKind: "draft-reply-send",
      accounts: [acct({ id: "slack-1", provider: "slack", primary: true })],
    });
    expect(out.mode).toBe("single");
    expect(out.accounts).toEqual([]);
  });

  it("resolves to primary even when primary is unhealthy — health is a UI concern", () => {
    // The resolver is intentionally health-agnostic; the AccountPicker is
    // responsible for surfacing an inline reauth affordance for the chosen
    // account when its status is unhealthy.
    const primary = acct({ id: "gh-1", provider: "github", primary: true });
    const other = acct({ id: "gh-2", provider: "github" });
    const out = resolve({
      providerId: "github",
      actionKind: "calendar-event-create",
      accounts: [primary, other],
    });
    expect(out.accounts[0]?.id).toBe("gh-1");
  });

  it("falls back to the first account when no row is flagged primary", () => {
    // Defensive: the foundations migration guarantees a primary, but we
    // resolve gracefully if a future code path has cleared the flag.
    const a = acct({ id: "gh-a", provider: "github", added_at: "2026-01-01T00:00:00.000Z" });
    const b = acct({ id: "gh-b", provider: "github", added_at: "2026-02-01T00:00:00.000Z" });
    const out = resolve({
      providerId: "github",
      actionKind: "draft-reply-send",
      accounts: [a, b],
    });
    expect(out.accounts[0]?.id).toBe("gh-a");
  });
});
