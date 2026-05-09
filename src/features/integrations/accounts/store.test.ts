import { describe, expect, it } from "vitest";
import {
  type AddAccountInput,
  addAccount,
  getPrimary,
  listAccounts,
  promotePrimary,
} from "#/features/integrations/accounts/store";
import type { SupabaseLike } from "#/shared/db";

type Row = {
  id: string;
  provider: string;
  account_id: string | null;
  handle: string | null;
  display_name: string | null;
  context: string | null;
  primary: boolean;
  added_at: string;
};

function makeClient(): { client: SupabaseLike; rows: Row[] } {
  const rows: Row[] = [];
  let nextId = 1;

  function buildSelectChain(filters: Array<[string, unknown]> = []) {
    const apply = (extra: Array<[string, unknown]>) =>
      buildSelectChain([...filters, ...extra]);
    return {
      is: () => apply([]),
      in: () => apply([]),
      ilike: () => apply([]),
      or: () => apply([]),
      gte: () => apply([]),
      lt: () => apply([]),
      eq: (col: string, val: unknown) => apply([[col, val]]),
      order: () => apply([]),
      limit: async (_n: number) => {
        const data = rows.filter((r) =>
          filters.every(([col, val]) => {
            if (col === "primary") {
              return r.primary === (val === "true" || val === true);
            }
            return (r as Record<string, unknown>)[col] === val;
          }),
        );
        return { data: data.map((r) => ({ ...r })), error: null };
      },
    };
  }

  function buildUpdateChain(values: Record<string, unknown>) {
    return {
      eq: async (col: string, val: unknown) => {
        for (const r of rows) {
          if ((r as Record<string, unknown>)[col] === val) {
            Object.assign(r, values);
          }
        }
        return { error: null };
      },
    };
  }

  const client: SupabaseLike = {
    from: (table: string) => {
      if (table !== "provider_accounts") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        upsert: async (
          values: Record<string, unknown> | Record<string, unknown>[],
          options: { onConflict: string },
        ) => {
          const list = Array.isArray(values) ? values : [values];
          for (const v of list) {
            const provider = v.provider as string;
            const accountId = (v.account_id ?? null) as string | null;
            const conflictKey = options.onConflict;
            let existing: Row | undefined;
            if (conflictKey === "provider,account_id") {
              existing = rows.find(
                (r) =>
                  r.provider === provider && r.account_id === accountId,
              );
            } else if (conflictKey === "id") {
              existing = rows.find((r) => r.id === (v.id as string));
            }
            if (existing) {
              Object.assign(existing, v);
            } else {
              rows.push({
                id: (v.id as string) ?? `acct-${nextId++}`,
                provider,
                account_id: accountId,
                handle: (v.handle as string | null) ?? null,
                display_name: (v.display_name as string | null) ?? null,
                context: (v.context as string | null) ?? null,
                primary: Boolean(v.primary),
                added_at: (v.added_at as string) ?? new Date().toISOString(),
              });
            }
          }
          return { error: null };
        },
        select: () => buildSelectChain(),
        update: (values: Record<string, unknown>) => buildUpdateChain(values),
      };
    },
  };

  return { client, rows };
}

describe("listAccounts / getPrimary", () => {
  it("returns the empty list when no rows exist", async () => {
    const { client } = makeClient();
    expect(await listAccounts(client)).toEqual([]);
    expect(await getPrimary(client, "github")).toBeNull();
  });

  it("returns rows for a provider sorted by added_at", async () => {
    const { client } = makeClient();
    await addAccount(client, fields("github", "u1"));
    await addAccount(client, fields("github", "u2"));
    const all = await listAccounts(client, { providerId: "github" });
    expect(all.map((a) => a.account_id)).toEqual(["u1", "u2"]);
  });
});

describe("addAccount", () => {
  it("auto-flags the first account on a provider as primary", async () => {
    const { client } = makeClient();
    const first = await addAccount(client, fields("github", "u1"));
    expect(first.primary).toBe(true);
    expect(await getPrimary(client, "github")).toMatchObject({
      account_id: "u1",
      primary: true,
    });
  });

  it("does not flag subsequent accounts as primary", async () => {
    const { client } = makeClient();
    await addAccount(client, fields("github", "u1"));
    const second = await addAccount(client, fields("github", "u2"));
    expect(second.primary).toBe(false);
    const primary = await getPrimary(client, "github");
    expect(primary?.account_id).toBe("u1");
  });

  it("treats re-adding the same identity as idempotent", async () => {
    const { client } = makeClient();
    const first = await addAccount(client, fields("github", "u1"));
    const again = await addAccount(client, fields("github", "u1"));
    expect(again.id).toBe(first.id);
    const all = await listAccounts(client, { providerId: "github" });
    expect(all).toHaveLength(1);
  });

  it("scopes auto-primary by provider", async () => {
    const { client } = makeClient();
    await addAccount(client, fields("github", "gh1"));
    const slack = await addAccount(client, fields("slack", "T1"));
    expect(slack.primary).toBe(true);
  });
});

describe("promotePrimary", () => {
  it("flips primary to the named account and demotes the prior one", async () => {
    const { client } = makeClient();
    const a = await addAccount(client, fields("github", "u1"));
    const b = await addAccount(client, fields("github", "u2"));
    await promotePrimary(client, b.id);
    const list = await listAccounts(client, { providerId: "github" });
    const map = Object.fromEntries(list.map((row) => [row.id, row.primary]));
    expect(map[a.id]).toBe(false);
    expect(map[b.id]).toBe(true);
  });

  it("is a no-op when the account is already primary", async () => {
    const { client } = makeClient();
    const a = await addAccount(client, fields("github", "u1"));
    await promotePrimary(client, a.id);
    const primary = await getPrimary(client, "github");
    expect(primary?.id).toBe(a.id);
  });

  it("does not touch other providers", async () => {
    const { client } = makeClient();
    const gh = await addAccount(client, fields("github", "u1"));
    const slack = await addAccount(client, fields("slack", "T1"));
    const slackB = await addAccount(client, fields("slack", "T2"));
    await promotePrimary(client, slackB.id);
    expect((await getPrimary(client, "github"))?.id).toBe(gh.id);
    expect((await getPrimary(client, "slack"))?.id).toBe(slackB.id);
    void slack;
  });
});

function fields(provider: string, accountId: string): AddAccountInput {
  return {
    provider,
    account_id: accountId,
    handle: `@${accountId}`,
    display_name: accountId.toUpperCase(),
    context: `ctx-${accountId}`,
  };
}
