// Login page — smoke, OAuth button, validation, and redirect tests.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSignInWithGoogle = vi.fn();

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    allowed: false,
    rejected: false,
  }),
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import { LoginPage } from "./login";
import { OAuthButtonRow } from "#/features/auth/components/OAuthButtonRow";
import { LoginForm } from "#/features/auth/components/LoginForm";

// ── LoginPage smoke ───────────────────────────────────────────────────────────

describe("LoginPage", () => {
  it("renders the sign-in heading", () => {
    render(<LoginPage />);
    expect(screen.getByText("Sign in to Devy")).toBeTruthy();
  });

  it("renders the Google OAuth button with correct accessible name", () => {
    render(<LoginPage />);
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeTruthy();
  });

  it("renders the info list", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("info-list")).toBeTruthy();
  });

  it("renders the deployment chip", () => {
    render(<LoginPage />);
    expect(screen.getByText("Deployment")).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
  });
});

// ── OAuthButtonRow ────────────────────────────────────────────────────────────

describe("OAuthButtonRow", () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockReset();
  });

  it("renders with accessible name", () => {
    render(<OAuthButtonRow onSignIn={mockSignInWithGoogle} />);
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeTruthy();
  });

  it("calls onSignIn when clicked", async () => {
    mockSignInWithGoogle.mockResolvedValue({ error: null });
    render(<OAuthButtonRow onSignIn={mockSignInWithGoogle} />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledOnce());
  });

  it("disables button while pending and shows redirect text", async () => {
    // never resolves during this test
    mockSignInWithGoogle.mockReturnValue(new Promise(() => {}));
    render(<OAuthButtonRow onSignIn={mockSignInWithGoogle} />);
    const btn = screen.getByRole("button", { name: /continue with google/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByText(/redirecting to google/i)).toBeTruthy(),
    );
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("calls onError and re-enables button when sign-in returns an error", async () => {
    mockSignInWithGoogle.mockResolvedValue({
      error: { message: "OAuth failed" },
    });
    const onError = vi.fn();
    render(<OAuthButtonRow onSignIn={mockSignInWithGoogle} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("OAuth failed"));
    // button should be re-enabled
    expect(
      screen.getByRole("button", { name: /continue with google/i }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

// ── LoginForm validation error state ─────────────────────────────────────────

describe("LoginForm error state", () => {
  it("shows an error alert when OAuth returns an error", async () => {
    mockSignInWithGoogle.mockResolvedValue({
      error: { message: "Access denied" },
    });
    render(<LoginForm />);
    fireEvent.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeTruthy(),
    );
    expect(screen.getByRole("alert").textContent).toContain("Access denied");
  });
});
