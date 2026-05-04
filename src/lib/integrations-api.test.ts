import { describe, expect, it, vi } from "vitest";
import {
  disconnectIntegration,
  getIntegrations,
  type IntegrationsStore,
  KNOWN_PROVIDERS,
  type ProviderAccountRow,
} from "#/lib/integrations-api";

function makeStore(rows: ProviderAccountRow[]): IntegrationsStore {
  let current = [...rows];
  return {
    loadAccounts: vi.fn(async () => current),
    deleteAccount: vi.fn(async (p: string) => {
      current = current.filter((r) => r.provider !== p);
    }),
  };
}

describe("getIntegrations", () => {
  it("returns one row per known provider, marking missing rows disconnected", async () => {
    const store = makeStore([]);
    const { integrations } = await getIntegrations(store);
    expect(integrations).toHaveLength(KNOWN_PROVIDERS.length);
    for (const i of integrations) {
      expect(i.status).toBe("disconnected");
      expect(i.scopes).toEqual([]);
      expect(i.account_id).toBeNull();
      expect(i.last_sync_at).toBeNull();
    }
  });

  it("marks rows present in provider_accounts as connected with scopes + sync time", async () => {
    const store = makeStore([
      {
        provider: "github",
        account_id: "U123",
        scopes: ["repo", "read:user"],
        expires_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-05-04T18:00:00Z",
      },
    ]);
    const { integrations } = await getIntegrations(store);
    const gh = integrations.find((i) => i.provider === "github");
    expect(gh).toEqual({
      provider: "github",
      status: "connected",
      account_id: "U123",
      scopes: ["repo", "read:user"],
      connected_at: "2026-01-01T00:00:00Z",
      last_sync_at: "2026-05-04T18:00:00Z",
      expires_at: null,
    });
    const slack = integrations.find((i) => i.provider === "slack");
    expect(slack?.status).toBe("disconnected");
  });

  it("treats null/missing scopes as an empty array", async () => {
    const store = makeStore([
      {
        provider: "slack",
        account_id: "U999",
        scopes: null,
        expires_at: null,
        created_at: null,
        updated_at: null,
      },
    ]);
    const { integrations } = await getIntegrations(store);
    const slack = integrations.find((i) => i.provider === "slack");
    expect(slack?.scopes).toEqual([]);
  });

  it("ignores provider_accounts rows for unknown providers", async () => {
    const store = makeStore([
      {
        provider: "myspace",
        account_id: "x",
        scopes: ["read"],
        expires_at: null,
        created_at: null,
        updated_at: null,
      },
    ]);
    const { integrations } = await getIntegrations(store);
    expect(integrations.find((i) => i.provider === "github")?.status).toBe(
      "disconnected",
    );
    expect(integrations.map((i) => i.provider)).toEqual([...KNOWN_PROVIDERS]);
  });
});

describe("disconnectIntegration", () => {
  it("deletes the row for a known provider", async () => {
    const store = makeStore([
      {
        provider: "github",
        account_id: "U123",
        scopes: [],
        expires_at: null,
        created_at: null,
        updated_at: null,
      },
    ]);
    const out = await disconnectIntegration("github", store);
    expect(out).toEqual({ ok: true, provider: "github" });
    expect(store.deleteAccount).toHaveBeenCalledWith("github");
    const { integrations } = await getIntegrations(store);
    expect(integrations.find((i) => i.provider === "github")?.status).toBe(
      "disconnected",
    );
  });

  it("rejects unknown providers without touching the store", async () => {
    const store = makeStore([]);
    const out = await disconnectIntegration("myspace", store);
    expect(out).toEqual({ ok: false, error: "unknown provider" });
    expect(store.deleteAccount).not.toHaveBeenCalled();
  });
});
