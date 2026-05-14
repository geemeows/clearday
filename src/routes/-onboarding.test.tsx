// Onboarding page — smoke, step transitions, state-preservation, and gate tests.

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("#/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("#/features/auth/auth", () => ({
  useAuth: () => ({
    session: {
      user: {
        email: "erin@example.com",
        user_metadata: { full_name: "Erin Test" },
      },
    },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/onboarding" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
    redirect: vi.fn(),
  };
});

// ── Component imports (after mocks) ──────────────────────────────────────────

import { OnboardingPage } from "./onboarding";
import { OnboardingFlow } from "#/features/onboarding/components/OnboardingFlow";
import { TodayPage } from "./_app.today";

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderFlow(onFinish = vi.fn()) {
  return render(<OnboardingFlow onFinish={onFinish} />);
}

function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

function clickBack() {
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
}

// ── OnboardingPage smoke ─────────────────────────────────────────────────────

describe("OnboardingPage", () => {
  it("renders the welcome heading", () => {
    render(<OnboardingPage />);
    expect(screen.getByText("Welcome to your Devy.")).toBeTruthy();
  });

  it("renders the stepper rail with all 5 step labels", () => {
    render(<OnboardingPage />);
    expect(screen.getByText("Welcome")).toBeTruthy();
    expect(screen.getByText("Integrations")).toBeTruthy();
    expect(screen.getByText("AI provider")).toBeTruthy();
    expect(screen.getByText("Alerts")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
  });

  it("renders the Continue button", () => {
    render(<OnboardingPage />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
  });
});

// ── Step 1 (Welcome) ─────────────────────────────────────────────────────────

describe("WelcomeStep", () => {
  it("shows the deployment summary card", () => {
    renderFlow();
    expect(screen.getByTestId("deployment-summary")).toBeTruthy();
  });

  it("shows the signed-in email", () => {
    renderFlow();
    expect(screen.getAllByText("erin@example.com").length).toBeGreaterThan(0);
  });

  it("Back button is disabled on the first step", () => {
    renderFlow();
    const back = screen.getByRole("button", { name: /back/i });
    expect(back.hasAttribute("disabled")).toBe(true);
  });
});

// ── Step transitions ─────────────────────────────────────────────────────────

describe("step transitions", () => {
  it("Continue advances from step 1 to step 2", () => {
    renderFlow();
    expect(screen.getByText("Welcome to your Devy.")).toBeTruthy();
    clickContinue();
    expect(screen.getByText("Connect your sources.")).toBeTruthy();
  });

  it("Back on step 2 returns to step 1", () => {
    renderFlow();
    clickContinue();
    expect(screen.getByText("Connect your sources.")).toBeTruthy();
    clickBack();
    expect(screen.getByText("Welcome to your Devy.")).toBeTruthy();
  });

  it("Back is disabled on step 1 but enabled on step 2", () => {
    renderFlow();
    expect(
      screen.getByRole("button", { name: /back/i }).hasAttribute("disabled"),
    ).toBe(true);
    clickContinue();
    expect(
      screen.getByRole("button", { name: /back/i }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("progresses through all 5 steps to show 'Open Devy' on the last", () => {
    renderFlow();
    clickContinue(); // → step 2
    clickContinue(); // → step 3
    clickContinue(); // → step 4
    clickContinue(); // → step 5 (Ready)
    expect(screen.getByRole("button", { name: /open devy/i })).toBeTruthy();
    expect(screen.getByText("You're all set.")).toBeTruthy();
  });
});

// ── State preservation ───────────────────────────────────────────────────────

describe("back-step preserves state", () => {
  it("connected providers are still connected after going back", () => {
    renderFlow();
    clickContinue(); // → step 2 (Integrations)
    // Click the first Connect button (GitHub)
    const connectButtons = screen.getAllByRole("button", { name: /connect/i });
    fireEvent.click(connectButtons[0]);
    // GitHub should now show Connected
    expect(screen.getByText(/connected/i)).toBeTruthy();

    clickContinue(); // → step 3 (AI Provider)
    clickBack(); // → step 2

    // GitHub should still show Connected
    expect(screen.getByText(/connected/i)).toBeTruthy();
  });
});

// ── AiProviderStep ───────────────────────────────────────────────────────────

describe("AiProviderStep", () => {
  beforeEach(() => {
    renderFlow();
    clickContinue(); // → step 2
    clickContinue(); // → step 3
  });

  it("renders all 6 provider options", () => {
    expect(screen.getByText("Gemini")).toBeTruthy();
    expect(screen.getByText("Groq")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("OpenRouter")).toBeTruthy();
    expect(screen.getByText("Skip for now")).toBeTruthy();
  });

  it("Gemini is selected by default", () => {
    const gemini = screen
      .getByRole("button", { name: /gemini/i })
      .closest("[data-provider='gemini']");
    expect(gemini?.getAttribute("data-selected")).toBe("true");
  });

  it("clicking Groq selects it", () => {
    fireEvent.click(screen.getByRole("button", { name: /groq/i }));
    const groq = screen
      .getByRole("button", { name: /groq/i })
      .closest("[data-provider='groq']");
    expect(groq?.getAttribute("data-selected")).toBe("true");
  });

  it("API key field is hidden when Skip is selected", () => {
    // API key field is shown by default (Gemini)
    expect(screen.getByLabelText("API key")).toBeTruthy();
    // Select Skip
    fireEvent.click(
      screen.getAllByRole("button").find((b) => b.textContent?.includes("Skip for now"))!,
    );
    // API key field should be gone
    expect(screen.queryByLabelText("API key")).toBeNull();
  });
});

// ── AlertsStep ───────────────────────────────────────────────────────────────

describe("AlertsStep", () => {
  beforeEach(() => {
    renderFlow();
    clickContinue(); // → 2
    clickContinue(); // → 3
    clickContinue(); // → 4 (Alerts)
  });

  it("Slack self-DM toggle defaults to on", () => {
    const slackSwitch = screen.getByRole("switch", {
      name: /toggle slack self-dm/i,
    });
    expect(slackSwitch.getAttribute("aria-checked")).toBe("true");
  });

  it("Web Push toggle defaults to off", () => {
    const pushSwitch = screen.getByRole("switch", {
      name: /toggle web push/i,
    });
    expect(pushSwitch.getAttribute("aria-checked")).toBe("false");
  });

  it("clicking 15 min selects it as the threshold", () => {
    const btn15 = screen
      .getAllByRole("radio")
      .find((b) => b.textContent?.trim() === "15 min");
    expect(btn15).toBeTruthy();
    fireEvent.click(btn15!);
    expect(btn15!.getAttribute("aria-pressed")).toBe("true");
  });

  it("10 min is the default threshold", () => {
    const btn10 = screen
      .getAllByRole("radio")
      .find((b) => b.textContent?.trim() === "10 min");
    expect(btn10?.getAttribute("aria-pressed")).toBe("true");
  });
});

// ── ReadyStep / finish ───────────────────────────────────────────────────────

describe("ReadyStep", () => {
  it("shows 'You're all set.' and the Open Devy button on step 5", () => {
    renderFlow();
    clickContinue();
    clickContinue();
    clickContinue();
    clickContinue();
    expect(screen.getByText("You're all set.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /open devy/i })).toBeTruthy();
  });

  it("'Open Devy' calls onFinish", () => {
    const onFinish = vi.fn();
    render(<OnboardingFlow onFinish={onFinish} />);
    clickContinue();
    clickContinue();
    clickContinue();
    clickContinue();
    fireEvent.click(screen.getByRole("button", { name: /open devy/i }));
    expect(onFinish).toHaveBeenCalledOnce();
  });
});

// ── Route finish — localStorage + navigate ───────────────────────────────────

describe("OnboardingPage finish", () => {
  afterEach(() => {
    localStorage.removeItem("devy:onboarded");
    mockNavigate.mockReset();
  });

  it("sets devy:onboarded in localStorage and navigates to /today on finish", async () => {
    render(<OnboardingPage />);
    // Advance to last step
    clickContinue();
    clickContinue();
    clickContinue();
    clickContinue();
    fireEvent.click(screen.getByRole("button", { name: /open devy/i }));
    await waitFor(() => {
      expect(localStorage.getItem("devy:onboarded")).toBe("1");
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/today" });
    });
  });

  it("Skip setup also sets devy:onboarded and navigates to /today", async () => {
    render(<OnboardingPage />);
    fireEvent.click(screen.getByRole("button", { name: /skip setup/i }));
    await waitFor(() => {
      expect(localStorage.getItem("devy:onboarded")).toBe("1");
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/today" });
    });
  });
});

// ── Today soft gate ──────────────────────────────────────────────────────────

describe("Today soft gate", () => {
  afterEach(() => {
    localStorage.removeItem("devy:onboarded");
    mockNavigate.mockReset();
  });

  it("redirects to /onboarding when devy:onboarded is not set", async () => {
    localStorage.removeItem("devy:onboarded");
    await act(async () => {
      render(<TodayPage />);
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/onboarding" }),
    );
  });

  it("does not redirect to /onboarding when devy:onboarded is set", async () => {
    localStorage.setItem("devy:onboarded", "1");
    await act(async () => {
      render(<TodayPage />);
    });
    // Let effects settle
    await new Promise((r) => setTimeout(r, 0));
    const calls = mockNavigate.mock.calls.filter(
      (c) => c[0]?.to === "/onboarding",
    );
    expect(calls.length).toBe(0);
  });
});
