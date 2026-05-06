import { describe, expect, it, vi } from "vitest";
import { loadSlackThread } from "#/features/integrations/providers/slack/capabilities/load-thread";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("loadSlackThread", () => {
  it("calls conversations.replies, resolves authors, substitutes <@id> mentions, and flags self", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("conversations.replies")) {
        expect(url).toContain(`channel=${encodeURIComponent("C1")}`);
        expect(url).toContain(`ts=${encodeURIComponent("100.0")}`);
        return jsonResponse({
          ok: true,
          messages: [
            { ts: "100.0", user: "U001SELF", text: "<@U001OTHER> hey" },
            { ts: "101.0", user: "U001OTHER", text: "what's up?" },
          ],
        });
      }
      if (url.includes("users.info")) {
        const m = url.match(/user=([^&]+)/);
        const id = m ? decodeURIComponent(m[1]!) : "";
        const name = id === "U001SELF" ? "geemeows" : "Other Person";
        return jsonResponse({
          ok: true,
          user: { profile: { display_name: name } },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const out = await loadSlackThread(
      { channel: "C1", thread_ts: "100.0" },
      { token: "xoxp", fetch: fetchImpl as unknown as typeof fetch },
      "U001SELF",
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.messages).toEqual([
      {
        ts: "100.0",
        user_id: "U001SELF",
        user_name: "geemeows",
        text: "@Other Person hey",
        is_self: true,
      },
      {
        ts: "101.0",
        user_id: "U001OTHER",
        user_name: "Other Person",
        text: "what's up?",
        is_self: false,
      },
    ]);
  });

  it("returns no_token when slack isn't connected", async () => {
    const out = await loadSlackThread(
      { channel: "C1", thread_ts: "1.0" },
      { token: null, fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out).toEqual({
      ok: false,
      error: "slack not connected",
      reason: "no_token",
      needs_reauth: true,
    });
  });

  it("validates required input", async () => {
    const out = await loadSlackThread(
      { channel: "", thread_ts: "1.0" },
      { token: "xoxp", fetch: vi.fn() as unknown as typeof fetch },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("invalid_input");
  });

  it("flags needs_reauth on missing_scope", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: false, error: "missing_scope" }),
    );
    const out = await loadSlackThread(
      { channel: "C1", thread_ts: "1.0" },
      { token: "xoxp", fetch: fetchImpl as unknown as typeof fetch },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.needs_reauth).toBe(true);
  });

  it("drops bot messages and edit subtypes", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("conversations.replies")) {
        return jsonResponse({
          ok: true,
          messages: [
            { ts: "1.0", user: "U001OTHER", text: "real" },
            { ts: "2.0", user: "U001OTHER", bot_id: "B1", text: "bot" },
            {
              ts: "3.0",
              user: "U001OTHER",
              subtype: "message_changed",
              text: "edit",
            },
          ],
        });
      }
      return jsonResponse({ ok: true, user: { name: "x" } });
    });
    const out = await loadSlackThread(
      { channel: "C1", thread_ts: "1.0" },
      { token: "xoxp", fetch: fetchImpl as unknown as typeof fetch },
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0]?.text).toBe("real");
  });
});
