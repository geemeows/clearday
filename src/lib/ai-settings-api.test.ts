import { describe, expect, it, vi } from "vitest";
import {
  type AiSettingsRow,
  type AiSettingsStore,
  getAiSettings,
  putAiSettings,
  testAiConnection,
} from "#/lib/ai-settings-api";

const SECRET = "deployment-key-secret-32bytes-or-so";

const ROW_DEFAULTS: AiSettingsRow = {
  provider: null,
  model: null,
  api_key: null,
  base_url: null,
  last_validated_at: null,
  monthly_budget_usd: 25,
  fallback_model: null,
  privacy_mode: false,
  redact_patterns: [],
  ai_disabled: false,
};

function row(overrides: Partial<AiSettingsRow>): AiSettingsRow {
  return { ...ROW_DEFAULTS, ...overrides };
}

function memoryStore(
  initial?: Partial<AiSettingsRow>,
): AiSettingsStore & { rows: AiSettingsRow | null } {
  let rows: AiSettingsRow | null = initial ? row(initial) : null;
  return {
    get rows() {
      return rows;
    },
    load: async () => rows,
    save: async (patch) => {
      const merged: AiSettingsRow = {
        ...ROW_DEFAULTS,
        ...(rows ?? {}),
        ...patch,
      };
      rows = merged;
      return merged;
    },
  };
}

describe("ai-settings-api", () => {
  it("getAiSettings: returns a clean view, never plaintext key", async () => {
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: "enc:v1:abc.def",
      base_url: null,
      last_validated_at: "2026-05-04T12:00:00Z",
    });
    const view = await getAiSettings({
      store,
      keySecret: SECRET,
      fetch: vi.fn() as unknown as typeof fetch,
    });
    expect(view).toMatchObject({
      provider: "openai",
      default_model: "gpt-4o-mini",
      base_url: null,
      has_api_key: true,
      last_validated_at: "2026-05-04T12:00:00Z",
      monthly_budget_usd: 25,
      privacy_mode: false,
      ai_disabled: false,
      redact_patterns: [],
      month_spent_usd: 0,
    });
  });

  it("putAiSettings: rejects unknown provider", async () => {
    const store = memoryStore();
    const out = await putAiSettings(
      { provider: "magic" },
      { store, keySecret: SECRET, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out).toEqual({ ok: false, error: "unknown provider" });
  });

  it("putAiSettings: encrypts api_key before persisting and clears validated stamp", async () => {
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: null,
      base_url: null,
      last_validated_at: "2026-05-01T10:00:00Z",
    });
    const out = await putAiSettings(
      {
        provider: "openai",
        default_model: "gpt-4o-mini",
        api_key: "sk-real",
      },
      { store, keySecret: SECRET, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out.ok).toBe(true);
    expect(store.rows?.api_key).toMatch(/^enc:v1:/);
    expect(store.rows?.api_key).not.toContain("sk-real");
    expect(store.rows?.last_validated_at).toBeNull();
    if (out.ok) {
      expect(out.settings.has_api_key).toBe(true);
      expect(out.settings.last_validated_at).toBeNull();
    }
  });

  it("putAiSettings: omitting api_key preserves the existing one", async () => {
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: "enc:v1:existing.blob",
      base_url: null,
      last_validated_at: null,
    });
    await putAiSettings(
      { provider: "openai", default_model: "gpt-4o" },
      { store, keySecret: SECRET, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(store.rows?.api_key).toBe("enc:v1:existing.blob");
    expect(store.rows?.model).toBe("gpt-4o");
  });

  it("testAiConnection: decrypts key, calls llm-client, stamps last_validated_at on success", async () => {
    // Encrypt a real key via the round-trip so we exercise actual crypto.
    const { encryptSecret } = await import("#/lib/llm-crypto");
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: await encryptSecret("sk-real", SECRET),
      base_url: null,
      last_validated_at: null,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "OK" } }],
            model: "gpt-4o-mini",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const fixedNow = new Date("2026-05-04T13:30:00Z");
    const out = await testAiConnection({
      store,
      keySecret: SECRET,
      fetch: fetchMock,
      now: () => fixedNow,
    });
    expect(out).toEqual({ ok: true, model: "gpt-4o-mini" });
    expect(store.rows?.last_validated_at).toBe(fixedNow.toISOString());
    // Confirm the bearer header used the *plaintext* key, i.e. decryption ran.
    const call = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-real",
    );
  });

  it("testAiConnection: surfaces provider error without stamping", async () => {
    const { encryptSecret } = await import("#/lib/llm-crypto");
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: await encryptSecret("sk-bad", SECRET),
      base_url: null,
      last_validated_at: null,
    });
    const fetchMock = vi.fn(
      async () => new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch;
    const out = await testAiConnection({
      store,
      keySecret: SECRET,
      fetch: fetchMock,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("401");
    expect(store.rows?.last_validated_at).toBeNull();
  });

  it("testAiConnection: refuses when key is missing for non-ollama providers", async () => {
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
      api_key: null,
      base_url: null,
      last_validated_at: null,
    });
    const out = await testAiConnection({
      store,
      keySecret: SECRET,
      fetch: vi.fn() as unknown as typeof fetch,
    });
    expect(out).toEqual({ ok: false, error: "no API key configured" });
  });

  it("testAiConnection: ollama works without an API key", async () => {
    const store = memoryStore({
      provider: "ollama",
      model: "llama3",
      api_key: null,
      base_url: "http://localhost:11434",
      last_validated_at: null,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { content: "OK" }, model: "llama3" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const out = await testAiConnection({
      store,
      keySecret: SECRET,
      fetch: fetchMock,
    });
    expect(out).toEqual({ ok: true, model: "llama3" });
  });

  it("putAiSettings: persists budget + fallback + privacy + redact_patterns + ai_disabled", async () => {
    const store = memoryStore({
      provider: "openai",
      model: "gpt-4o-mini",
    });
    const out = await putAiSettings(
      {
        provider: "openai",
        default_model: "gpt-4o-mini",
        monthly_budget_usd: 50,
        fallback_model: "gpt-4o-mini",
        privacy_mode: true,
        redact_patterns: ["acme-[a-z]+", "  ", "secret"],
        ai_disabled: false,
      },
      { store, keySecret: SECRET, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out.ok).toBe(true);
    expect(store.rows?.monthly_budget_usd).toBe(50);
    expect(store.rows?.fallback_model).toBe("gpt-4o-mini");
    expect(store.rows?.privacy_mode).toBe(true);
    expect(store.rows?.redact_patterns).toEqual(["acme-[a-z]+", "secret"]);
    expect(store.rows?.ai_disabled).toBe(false);
  });

  it("putAiSettings: rejects negative budget", async () => {
    const store = memoryStore({ provider: "openai", model: "gpt-4o-mini" });
    const out = await putAiSettings(
      { provider: "openai", monthly_budget_usd: -1 },
      { store, keySecret: SECRET, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out).toEqual({
      ok: false,
      error: "monthly_budget_usd must be a non-negative number",
    });
  });

  it("getAiSettings: includes month_spent_usd from the usage store", async () => {
    const store = memoryStore({ provider: "openai", model: "gpt-4o-mini" });
    const usageStore = {
      from: () => ({
        select: () => ({
          gte: () => ({
            lt: async () => ({
              data: [{ cost_usd: 1.25 }, { cost_usd: 0.5 }],
              error: null,
            }),
          }),
        }),
      }),
    };
    const view = await getAiSettings({
      store,
      usageStore,
      keySecret: SECRET,
      fetch: vi.fn() as unknown as typeof fetch,
    });
    expect(view.month_spent_usd).toBeCloseTo(1.75, 4);
  });
});
