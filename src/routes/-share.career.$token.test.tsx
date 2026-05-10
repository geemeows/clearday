import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharedLevelView } from "#/routes/share.career.$token";
import type { SharedTree } from "#/features/career/store";
import type { SupabaseLike } from "#/shared/db";

function clientWithRpc(data: SharedTree | null) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  const client: SupabaseLike = {
    from: () => {
      throw new Error("from() should not be called on the public route");
    },
    rpc,
  };
  return { client, rpc };
}

function tree(): SharedTree {
  return {
    level: {
      id: "lvl1",
      title: "L4",
      status: "active",
      header: [{ key: "Role", value: "Engineer" }],
      created_at: "2026-01-01T00:00:00Z",
      archived_at: null,
    },
    competencies: [
      {
        id: "c1",
        level_id: "lvl1",
        name: "Craft",
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ],
    criteria: [
      {
        id: "cr1",
        competency_id: "c1",
        name: "Code review",
        target: 3,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ],
    indicators: [
      {
        id: "i1",
        criterion_id: "cr1",
        code: "A",
        description: "Reviews PRs daily",
        notes: null,
        score: 2,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ],
    evidence: [
      {
        id: "e1",
        indicator_id: "i1",
        title: "Recent review",
        url: "https://example.com/pr/1",
        note: null,
        card_id: null,
        position: 0,
        created_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ],
  };
}

describe("SharedLevelView", () => {
  it("calls career_share_read with the token and renders the level title + tree + wheel", async () => {
    const { client, rpc } = clientWithRpc(tree());
    render(<SharedLevelView token="tok123" client={client} />);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("career_share_read", {
        p_token: "tok123",
      }),
    );
    expect(await screen.findByRole("heading", { name: "L4" })).toBeTruthy();
    // Competency name appears as a tree heading and as a wheel-axis SVG label.
    expect(screen.getByRole("heading", { name: "Craft" })).toBeTruthy();
    expect(screen.getByText("Code review")).toBeTruthy();
    expect(screen.getByText("Reviews PRs daily")).toBeTruthy();
    // Header KV row.
    expect(screen.getByText("Role")).toBeTruthy();
    expect(screen.getByText("Engineer")).toBeTruthy();
    // Evidence link.
    const link = screen.getByRole("link", { name: "Recent review" });
    expect(link.getAttribute("href")).toBe("https://example.com/pr/1");
    // Wheel SVG mounts.
    expect(screen.getByRole("img", { name: "Career wheel" })).toBeTruthy();
  });

  it("renders an unavailable message when the rpc returns null (revoked / unknown token)", async () => {
    const { client } = clientWithRpc(null);
    render(<SharedLevelView token="bad" client={client} />);
    expect(
      await screen.findByRole("heading", { name: "Link unavailable" }),
    ).toBeTruthy();
  });
});
