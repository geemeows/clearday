import { describe, expect, it, vi } from "vitest";
import type {
  ScaleLegend,
  StoredCompetency,
  StoredCriterion,
  StoredEvidence,
  StoredIndicator,
  StoredLevel,
} from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";
import { syncCareerLevelToSheet, unlinkCareerSheet } from "./sync";

// ─── Supabase fake ───────────────────────────────────────────────────────────
//
// Per-table canned reads (`reads`) and a captured update log (`updates`) so
// tests can assert what the sync wrote back. The fake matches the small
// surface store.ts uses: `from(t).select("*").eq/in/is/order/limit` for reads
// and `from(t).update(patch).eq(col, val)` for writes.

type TableData = Record<string, unknown>[];

function fakeClient(reads: Record<string, TableData>): {
  client: SupabaseLike;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
} {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const client: SupabaseLike = {
    from: (table: string) => {
      const data = reads[table] ?? [];
      const chain: Record<string, unknown> = {};
      const ret = {
        is: () => chain,
        in: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data, error: null }),
      };
      Object.assign(chain, ret);
      return {
        select: () => chain,
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, patch });
            return { error: null };
          },
        }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      } as unknown as ReturnType<SupabaseLike["from"]>;
    },
  };
  return { client, updates };
}

// ─── Sheets API fetch mock ───────────────────────────────────────────────────
//
// Matches on URL + method and returns canned responses; records every call so
// tests can assert call order (delete-chart → clear → batch → addChart).

type FetchCall = { url: string; method: string; body: string | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockSheetsFetch(opts: {
  createResponse?: () => Response;
  metadataResponse?: () => Response;
  errorOn?: { method: string; urlContains: string; status: number };
}): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    calls.push({ url, method, body });
    if (
      opts.errorOn &&
      method === opts.errorOn.method &&
      url.includes(opts.errorOn.urlContains)
    ) {
      return new Response("err", { status: opts.errorOn.status });
    }
    if (
      method === "POST" &&
      url === "https://sheets.googleapis.com/v4/spreadsheets"
    ) {
      return (opts.createResponse ?? defaultCreateResponse)();
    }
    if (method === "GET" && /\/v4\/spreadsheets\/[^/?]+\?fields=/.test(url)) {
      return (opts.metadataResponse ?? defaultMetadataResponse)();
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

function defaultCreateResponse(): Response {
  return jsonResponse({
    spreadsheetId: "ssid-new",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ssid-new/edit",
    sheets: [
      { properties: { sheetId: 100, title: "Report" } },
      { properties: { sheetId: 200, title: "Wheel" } },
    ],
  });
}

function defaultMetadataResponse(): Response {
  return jsonResponse({
    sheets: [
      { properties: { sheetId: 100, title: "Report" } },
      {
        properties: { sheetId: 200, title: "Wheel" },
        charts: [{ chartId: 555 }],
      },
    ],
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function level(overrides: Partial<StoredLevel> = {}): StoredLevel {
  return {
    id: "lvl-1",
    title: "L4 Senior",
    status: "active",
    header: [{ key: "Owner", value: "Mona" }],
    sheet_id: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function competency(
  overrides: Partial<StoredCompetency> = {},
): StoredCompetency {
  return {
    id: "c1",
    level_id: "lvl-1",
    name: "Engineering",
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function criterion(overrides: Partial<StoredCriterion> = {}): StoredCriterion {
  return {
    id: "cr1",
    competency_id: "c1",
    name: "Code quality",
    target: 3,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function indicator(overrides: Partial<StoredIndicator> = {}): StoredIndicator {
  return {
    id: "i1",
    criterion_id: "cr1",
    code: null,
    description: "Writes maintainable code",
    notes: null,
    score: 2,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function evidence(overrides: Partial<StoredEvidence> = {}): StoredEvidence {
  return {
    id: "e1",
    indicator_id: "i1",
    title: "Refactor PR",
    url: "https://example.com/pr/1",
    note: null,
    card_id: null,
    position: 0,
    created_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

const LEGEND: ScaleLegend = {
  s1: "Foundational",
  s2: "Practising",
  s3: "Proficient",
  s4: "Leading",
} as unknown as ScaleLegend;

function baseReads(
  over: Partial<{
    career_levels: TableData;
    career_competencies: TableData;
    career_criteria: TableData;
    career_indicators: TableData;
    career_evidence: TableData;
    user_preferences: TableData;
  }> = {},
): Record<string, TableData> {
  return {
    career_levels: over.career_levels ?? [level()],
    career_competencies: over.career_competencies ?? [competency()],
    career_criteria: over.career_criteria ?? [criterion()],
    career_indicators: over.career_indicators ?? [indicator()],
    career_evidence: over.career_evidence ?? [evidence()],
    career_scale_legend: [LEGEND],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("syncCareerLevelToSheet", () => {
  it("returns no_token when token is null", async () => {
    const { client } = fakeClient(baseReads());
    const { fetch } = mockSheetsFetch({});
    const out = await syncCareerLevelToSheet("lvl-1", {
      client,
      token: null,
      fetch,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("no_token");
    expect(out.needs_reauth).toBe(true);
  });

  it("returns level_not_found when the level row is missing", async () => {
    const { client } = fakeClient(baseReads({ career_levels: [] }));
    const { fetch } = mockSheetsFetch({});
    const out = await syncCareerLevelToSheet("lvl-1", {
      client,
      token: "t",
      fetch,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("level_not_found");
  });

  it("first sync: creates spreadsheet, persists sheet_id, applies render, bumps last_synced_at", async () => {
    const { client, updates } = fakeClient(baseReads());
    const { fetch, calls } = mockSheetsFetch({});
    const now = new Date("2026-05-10T12:00:00Z");
    const out = await syncCareerLevelToSheet("lvl-1", {
      client,
      token: "t",
      fetch,
      now: () => now,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.spreadsheetId).toBe("ssid-new");
    expect(out.spreadsheetUrl).toContain("ssid-new");
    expect(out.last_synced_at).toBe("2026-05-10T12:00:00.000Z");

    // Wrote sheet_id then last_synced_at to career_levels.
    const careerUpdates = updates.filter((u) => u.table === "career_levels");
    expect(careerUpdates).toHaveLength(2);
    expect(careerUpdates[0].patch).toEqual({ sheet_id: "ssid-new" });
    expect(careerUpdates[1].patch).toEqual({
      last_synced_at: "2026-05-10T12:00:00.000Z",
    });

    // First call is createSpreadsheet (no metadata fetch on first sync).
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://sheets.googleapis.com/v4/spreadsheets",
    });
    expect(
      calls.some((c) => c.method === "GET" && c.url.includes("?fields=")),
    ).toBe(false);

    // Order of tab clears + chart add.
    const reportClearIdx = calls.findIndex(
      (c) => c.url.includes("/values/Report:clear") && c.method === "POST",
    );
    const wheelClearIdx = calls.findIndex(
      (c) => c.url.includes("/values/Wheel:clear") && c.method === "POST",
    );
    const addChartIdx = calls.findIndex(
      (c) =>
        c.method === "POST" &&
        c.url.endsWith(":batchUpdate") &&
        c.body !== null &&
        c.body.includes("addChart"),
    );
    expect(reportClearIdx).toBeGreaterThan(0);
    expect(wheelClearIdx).toBeGreaterThan(reportClearIdx);
    expect(addChartIdx).toBeGreaterThan(wheelClearIdx);
  });

  it("subsequent sync: reads metadata, deletes existing chart, then re-adds", async () => {
    const { client } = fakeClient(
      baseReads({ career_levels: [level({ sheet_id: "ssid-existing" })] }),
    );
    const { fetch, calls } = mockSheetsFetch({});
    const out = await syncCareerLevelToSheet("lvl-1", {
      client,
      token: "t",
      fetch,
    });
    expect(out.ok).toBe(true);

    // Metadata GET happens before any clear/update.
    const metadataIdx = calls.findIndex(
      (c) => c.method === "GET" && c.url.includes("?fields="),
    );
    expect(metadataIdx).toBeGreaterThanOrEqual(0);
    expect(calls[metadataIdx].url).toContain("ssid-existing");

    // Existing chartId 555 (from defaultMetadataResponse) is deleted before
    // the addChart at the end.
    const deleteChartIdx = calls.findIndex(
      (c) =>
        c.method === "POST" &&
        c.url.endsWith(":batchUpdate") &&
        c.body !== null &&
        c.body.includes("deleteEmbeddedObject") &&
        c.body.includes("555"),
    );
    let addChartIdx = -1;
    for (let i = calls.length - 1; i >= 0; i--) {
      const c = calls[i];
      if (
        c.method === "POST" &&
        c.url.endsWith(":batchUpdate") &&
        c.body !== null &&
        c.body.includes("addChart")
      ) {
        addChartIdx = i;
        break;
      }
    }
    expect(deleteChartIdx).toBeGreaterThanOrEqual(0);
    expect(addChartIdx).toBeGreaterThan(deleteChartIdx);
  });

  it("returns sheets_api_error with needs_reauth on 401", async () => {
    const { client } = fakeClient(baseReads());
    const { fetch } = mockSheetsFetch({
      errorOn: {
        method: "POST",
        urlContains: "/v4/spreadsheets",
        status: 401,
      },
    });
    const out = await syncCareerLevelToSheet("lvl-1", {
      client,
      token: "expired",
      fetch,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("sheets_api_error");
    expect(out.needs_reauth).toBe(true);
  });
});

describe("unlinkCareerSheet", () => {
  it("nulls sheet_id and last_synced_at", async () => {
    const { client, updates } = fakeClient(baseReads());
    const out = await unlinkCareerSheet("lvl-1", client);
    expect(out.ok).toBe(true);
    expect(updates).toEqual([
      {
        table: "career_levels",
        patch: { sheet_id: null, last_synced_at: null },
      },
    ]);
  });
});
