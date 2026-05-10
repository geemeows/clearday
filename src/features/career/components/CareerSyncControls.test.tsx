import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareerSyncControls } from "./CareerSyncControls";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

const originalConfirm = window.confirm;
afterEach(() => {
  window.confirm = originalConfirm;
});

describe("CareerSyncControls — never synced", () => {
  it("shows the 'Sync to Google Sheet' button and no status pill", () => {
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId={null}
        lastSyncedAt={null}
        onChanged={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /sync to google sheet/i }),
    ).toBeTruthy();
    expect(screen.queryByTestId("career-sync-status")).toBeNull();
    expect(screen.queryByRole("button", { name: /unlink/i })).toBeNull();
  });

  it("on success, shows the open-sheet link and calls onChanged with new state", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        spreadsheetId: "ssid-1",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ssid-1/edit",
        last_synced_at: "2026-05-10T12:00:00.000Z",
      }),
    ) as unknown as typeof fetch;
    const onChanged = vi.fn();
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId={null}
        lastSyncedAt={null}
        onChanged={onChanged}
        fetchImpl={fetchImpl}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /sync to google sheet/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/synced/i);
    });
    const link = screen.getByRole("link", { name: /open sheet/i });
    expect(link.getAttribute("href")).toBe(
      "https://docs.google.com/spreadsheets/d/ssid-1/edit",
    );
    expect(onChanged).toHaveBeenCalledWith({
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ssid-1/edit",
      lastSyncedAt: "2026-05-10T12:00:00.000Z",
    });
  });

  it("on error, shows the message and a reconnect link when needs_reauth", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        { ok: false, error: "google not connected", needs_reauth: true },
        { status: 400 },
      ),
    ) as unknown as typeof fetch;
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId={null}
        lastSyncedAt={null}
        onChanged={() => {}}
        fetchImpl={fetchImpl}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /sync to google sheet/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /google not connected/i,
      );
    });
    const reconnect = screen.getByRole("link", { name: /reconnect google/i });
    expect(reconnect.getAttribute("href")).toBe("/integrations");
  });
});

describe("CareerSyncControls — already synced", () => {
  it("shows 'Synced Xm ago', Sync now, Open, and Unlink", () => {
    const now = new Date("2026-05-10T12:30:00Z");
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId="ssid-1"
        lastSyncedAt="2026-05-10T12:25:00Z"
        onChanged={() => {}}
        now={() => now}
      />,
    );
    expect(screen.getByTestId("career-sync-status").textContent).toBe(
      "Synced 5m ago",
    );
    expect(screen.getByRole("button", { name: /sync now/i })).toBeTruthy();
    const open = screen.getByRole("link", { name: /open google sheet/i });
    expect(open.getAttribute("href")).toBe(
      "https://docs.google.com/spreadsheets/d/ssid-1/edit",
    );
    expect(screen.getByRole("button", { name: /unlink/i })).toBeTruthy();
  });

  it("unlink confirms, POSTs /api/career/unlink, and notifies onChanged with nulls", async () => {
    window.confirm = vi.fn(() => true);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true }),
    ) as unknown as typeof fetch;
    const onChanged = vi.fn();
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId="ssid-1"
        lastSyncedAt="2026-05-10T12:25:00Z"
        onChanged={onChanged}
        fetchImpl={fetchImpl}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /unlink/i }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalledWith({
      spreadsheetUrl: null,
      lastSyncedAt: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/career/unlink",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unlink does nothing when the user cancels the confirm prompt", () => {
    window.confirm = vi.fn(() => false);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true }),
    ) as unknown as typeof fetch;
    const onChanged = vi.fn();
    render(
      <CareerSyncControls
        levelId="lvl-1"
        sheetId="ssid-1"
        lastSyncedAt={null}
        onChanged={onChanged}
        fetchImpl={fetchImpl}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /unlink/i }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });
});
