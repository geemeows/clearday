import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveInitials,
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
    });
  });

  it("renders name and a meta line that joins email + GitHub handle", async () => {
    render(<ProfilePanel loader={async () => FIELDS} />);
    expect(await screen.findByText("Devy User")).toBeTruthy();
    expect(
      screen.getByText("user@example.com · GitHub @geemeows"),
    ).toBeTruthy();
  });

  it("hides the GitHub handle when no integration is connected", async () => {
    const noGithub: ProfileFields = { ...FIELDS, githubHandle: null };
    render(<ProfilePanel loader={async () => noGithub} />);
    expect(await screen.findByText("user@example.com")).toBeTruthy();
    expect(screen.queryByText(/GitHub @/)).toBeNull();
    expect(screen.queryByText(/@undefined/)).toBeNull();
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
      await screen.findByRole("button", {
        name: /switch to (light|dark) mode/i,
      }),
    ).toBeTruthy();
  });

  describe("deriveInitials", () => {
    it("uses the first letter of the first and last name token", () => {
      expect(deriveInitials("Ada Lovelace", null)).toBe("AL");
      expect(deriveInitials("Erin Marie Kovacs", null)).toBe("EK");
    });

    it("falls back to the first two characters when only one token is present", () => {
      expect(deriveInitials("Devy", null)).toBe("DE");
    });

    it("falls back to the email when no display name is set", () => {
      expect(deriveInitials(null, "grace@example.com")).toBe("GR");
    });
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
