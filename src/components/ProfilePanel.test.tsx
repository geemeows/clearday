import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ProfileFields, ProfilePanel } from "#/components/ProfilePanel";

const FIELDS: ProfileFields = {
  displayName: "Devy User",
  email: "user@example.com",
  avatarUrl: null,
  githubHandle: "geemeows",
};

describe("ProfilePanel", () => {
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
});
