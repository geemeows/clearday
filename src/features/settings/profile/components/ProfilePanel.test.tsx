import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadProfileFields,
  type ProfileFields,
  ProfilePanel,
} from "#/features/settings/profile/components/ProfilePanel";

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
  },
}));

import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";

const mockApi = vi.mocked(apiFetch);
const mockGetSession = vi.mocked(supabase.auth.getSession);

type SessionStub = {
  user: { email?: string; user_metadata: Record<string, unknown> };
};
function sessionResult(session: SessionStub | null) {
  return Promise.resolve({
    data: { session },
    error: null,
  }) as unknown as ReturnType<typeof supabase.auth.getSession>;
}

const FIELDS: ProfileFields = {
  displayName: "Devy User",
  email: "user@example.com",
  avatarUrl: null,
  githubHandle: "geemeows",
};

describe("ProfilePanel", () => {
  beforeEach(() => {
    // ThemeToggle mounted in the panel reads /api/theme on mount.
    mockApi.mockResolvedValue({
      theme: "light",
      density: "comfortable",
      accent: "rausch",
    });
  });

  it("renders avatar fallback, name, email, and GitHub handle from useProfile", async () => {
    render(<ProfilePanel loader={async () => FIELDS} />);
    expect(await screen.findByText("Devy User")).toBeTruthy();
    expect(screen.getByText("user@example.com")).toBeTruthy();
    expect(screen.getByText("@geemeows")).toBeTruthy();
  });

  it("Sign out button fires the injected handler", async () => {
    const onSignOut = vi.fn();
    render(<ProfilePanel loader={async () => FIELDS} onSignOut={onSignOut} />);
    const button = await screen.findByRole("button", { name: /sign out/i });
    fireEvent.click(button);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("renders the theme toggle alongside the profile fields", async () => {
    render(<ProfilePanel loader={async () => FIELDS} />);
    expect(
      await screen.findByRole("button", { name: /switch to (light|dark) mode/i }),
    ).toBeTruthy();
  });

  describe("loadProfileFields", () => {
    beforeEach(() => {
      mockApi.mockReset();
      mockGetSession.mockReset();
    });
    afterEach(() => {
      vi.clearAllMocks();
    });

    it("pulls name, email, and avatar from the Google session user_metadata", async () => {
      mockApi.mockResolvedValueOnce({ integrations: [] });
      mockGetSession.mockReturnValueOnce(
        sessionResult({
          user: {
            email: "ada@example.com",
            user_metadata: {
              full_name: "Ada Lovelace",
              avatar_url: "https://lh3.googleusercontent.com/ada.jpg",
            },
          },
        }),
      );

      const fields = await loadProfileFields();
      expect(fields).toEqual({
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: "https://lh3.googleusercontent.com/ada.jpg",
        githubHandle: null,
      });
    });

    it("falls back to picture/name when full_name and avatar_url are absent", async () => {
      mockApi.mockResolvedValueOnce({ integrations: [] });
      mockGetSession.mockReturnValueOnce(
        sessionResult({
          user: {
            email: "g@example.com",
            user_metadata: {
              name: "Grace Hopper",
              picture: "https://lh3.googleusercontent.com/grace.jpg",
            },
          },
        }),
      );

      const fields = await loadProfileFields();
      expect(fields.displayName).toBe("Grace Hopper");
      expect(fields.avatarUrl).toBe(
        "https://lh3.googleusercontent.com/grace.jpg",
      );
    });

    it("joins the GitHub handle from /api/integrations", async () => {
      mockApi.mockResolvedValueOnce({
        integrations: [{ provider: "github", account_id: "geemeows" }],
      });
      mockGetSession.mockReturnValueOnce(
        sessionResult({
          user: { email: "u@example.com", user_metadata: {} },
        }),
      );

      const fields = await loadProfileFields();
      expect(fields.githubHandle).toBe("geemeows");
    });
  });
});
