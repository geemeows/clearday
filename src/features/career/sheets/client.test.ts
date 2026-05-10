import { describe, expect, it, vi } from "vitest";
import type { ChartSpec } from "#/features/career/sheet-render";
import {
  addChart,
  batchUpdate,
  clearTab,
  createSpreadsheet,
  getSpreadsheetMetadata,
  SheetsApiError,
} from "./client";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}

function mockFetch(
  impl: (url: string, init: RequestInit) => Response,
): FetchMock {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    impl(typeof input === "string" ? input : input.toString(), init ?? {}),
  ) as unknown as FetchMock;
}

const TOKEN = "ya29.test-token";

describe("createSpreadsheet", () => {
  it("POSTs to /v4/spreadsheets with title + Report/Wheel tabs and returns ids", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(headers["content-type"]).toBe("application/json");
      const body = JSON.parse(init.body as string);
      expect(body.properties.title).toBe("Career — L4 Senior");
      expect(body.sheets).toEqual([
        { properties: { title: "Report" } },
        { properties: { title: "Wheel" } },
      ]);
      return jsonResponse({
        spreadsheetId: "ssid-1",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ssid-1/edit",
        sheets: [
          { properties: { sheetId: 100, title: "Report" } },
          { properties: { sheetId: 200, title: "Wheel" } },
        ],
      });
    });
    const out = await createSpreadsheet("Career — L4 Senior", {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({
      spreadsheetId: "ssid-1",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ssid-1/edit",
      reportSheetId: 100,
      wheelSheetId: 200,
    });
  });

  it("throws SheetsApiError on non-2xx", async () => {
    const fetchImpl = mockFetch(() => textResponse("forbidden", 403));
    await expect(
      createSpreadsheet("X", {
        token: TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SheetsApiError);
  });

  it("throws when response is missing Report or Wheel sheetId", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        spreadsheetId: "x",
        spreadsheetUrl: "u",
        sheets: [{ properties: { sheetId: 1, title: "Report" } }],
      }),
    );
    await expect(
      createSpreadsheet("X", {
        token: TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SheetsApiError);
  });
});

describe("getSpreadsheetMetadata", () => {
  it("GETs spreadsheet with field mask and extracts sheet ids + chart ids", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toContain(
        "https://sheets.googleapis.com/v4/spreadsheets/ssid-1?fields=",
      );
      expect(url).toContain("charts(chartId)");
      expect(init.method).toBe("GET");
      return jsonResponse({
        sheets: [
          { properties: { sheetId: 10, title: "Report" }, charts: [] },
          {
            properties: { sheetId: 20, title: "Wheel" },
            charts: [{ chartId: 555 }, { chartId: 777 }],
          },
        ],
      });
    });
    const meta = await getSpreadsheetMetadata("ssid-1", {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(meta).toEqual({
      reportSheetId: 10,
      wheelSheetId: 20,
      wheelChartIds: [555, 777],
    });
  });

  it("returns empty wheelChartIds when Wheel tab has no charts", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        sheets: [
          { properties: { sheetId: 10, title: "Report" } },
          { properties: { sheetId: 20, title: "Wheel" } },
        ],
      }),
    );
    const meta = await getSpreadsheetMetadata("ssid-1", {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(meta.wheelChartIds).toEqual([]);
  });

  it("throws when Wheel tab is missing", async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        sheets: [{ properties: { sheetId: 10, title: "Report" } }],
      }),
    );
    await expect(
      getSpreadsheetMetadata("ssid-1", {
        token: TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SheetsApiError);
  });
});

describe("clearTab", () => {
  it("POSTs values/{tab}:clear", async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe(
        "https://sheets.googleapis.com/v4/spreadsheets/ssid-1/values/Report:clear",
      );
      expect(init.method).toBe("POST");
      expect(init.body).toBe("{}");
      return jsonResponse({});
    });
    await clearTab("ssid-1", "Report", {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = mockFetch(() => textResponse("nope", 500));
    await expect(
      clearTab("ssid-1", "Report", {
        token: TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SheetsApiError);
  });
});

describe("batchUpdate", () => {
  it("POSTs :batchUpdate with the given requests", async () => {
    const requests = [
      {
        mergeCells: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 5,
          },
          mergeType: "MERGE_ALL" as const,
        },
      },
    ];
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe(
        "https://sheets.googleapis.com/v4/spreadsheets/ssid-1:batchUpdate",
      );
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.requests).toEqual(requests);
      return jsonResponse({ replies: [] });
    });
    await batchUpdate("ssid-1", requests, {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("is a no-op when there are no requests", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({}));
    await batchUpdate("ssid-1", [], {
      token: TOKEN,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = mockFetch(() => textResponse("bad", 400));
    await expect(
      batchUpdate("ssid-1", [{ deleteEmbeddedObject: { objectId: 1 } }], {
        token: TOKEN,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SheetsApiError);
  });
});

describe("addChart", () => {
  it("wraps addChart request with overlay anchored on the Wheel tab", async () => {
    const chartSpec: ChartSpec = {
      title: "Wheel",
      basicChart: {
        chartType: "RADAR",
        legendPosition: "RIGHT_LEGEND",
        domains: [],
        series: [],
        headerCount: 1,
      },
    };
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe(
        "https://sheets.googleapis.com/v4/spreadsheets/ssid-1:batchUpdate",
      );
      const body = JSON.parse(init.body as string);
      expect(body.requests).toHaveLength(1);
      const req = body.requests[0];
      expect(req.addChart.chart.spec).toEqual(chartSpec);
      expect(
        req.addChart.chart.position.overlayPosition.anchorCell.sheetId,
      ).toBe(20);
      return jsonResponse({ replies: [] });
    });
    await addChart(
      { spreadsheetId: "ssid-1", wheelSheetId: 20, chartSpec },
      { token: TOKEN, fetch: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
