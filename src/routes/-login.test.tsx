import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "#/routes/login";

describe("LoginPage", () => {
  it("renders the brand surface, heading, and deployment chip", () => {
    render(
      <LoginPage onSignIn={async () => undefined} deploymentHost="devy.kovacs.dev" />,
    );

    expect(
      screen.getByRole("heading", { name: "Sign in to Devy", level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText("ALLOWED_EMAIL")).toBeTruthy();
    expect(screen.getByText("devy.kovacs.dev")).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText(/Your morning,/)).toBeTruthy();
    expect(screen.getByText(/already triaged\./)).toBeTruthy();
  });

  it("exposes the Continue with Google button with an accessible name and fires the handler", async () => {
    const onSignIn = vi.fn(async () => undefined);
    render(<LoginPage onSignIn={onSignIn} deploymentHost="devy.local" />);

    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).toBeTruthy();

    fireEvent.click(button);
    await waitFor(() => {
      expect(onSignIn).toHaveBeenCalledTimes(1);
    });
    expect(button.textContent).toContain("Redirecting to Google");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders the validation error state when the OAuth handler rejects", async () => {
    const onSignIn = vi.fn(async () => {
      throw new Error("supabase down");
    });
    render(<LoginPage onSignIn={onSignIn} deploymentHost="devy.local" />);

    const button = screen.getByRole("button", { name: /continue with google/i });
    fireEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("supabase down");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders the three authorize-next info rows", () => {
    render(<LoginPage onSignIn={async () => undefined} deploymentHost="devy.local" />);
    expect(screen.getByText(/App login only\./)).toBeTruthy();
    expect(screen.getByText(/Tokens stay in your Supabase\./)).toBeTruthy();
    expect(screen.getByText(/Connect integrations after\./)).toBeTruthy();
  });
});
