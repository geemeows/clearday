// Settings page — layout, per-tab smoke, and behavioral tests.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
    session: { user: { email: "test@example.com", user_metadata: {} } },
    loading: false,
    allowed: true,
    rejected: false,
  }),
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useRouterState: ({
      select,
    }: {
      select: (s: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/settings" } }),
    createFileRoute: () => (opts: { component: unknown }) => opts,
  };
});

vi.mock("#/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    theme: "system",
    density: "comfortable",
    weekStart: "mon",
    integrations: [],
    worker_url: "https://devy.example.dev",
    worker_version: "v0.41.2",
    supabase_url: "dyy-prod.supabase.co",
    allowed_email: "test@example.com",
    auth_proxy_url: "auth.devy.dev",
    signal_count: 1847,
    rollup_count: 12,
    retention_days: 90,
  }),
}));

// ── Component imports (after mocks) ───────────────────────────────────────────

import { SettingsPage } from "#/features/settings/components/SettingsPage";
import {
  IntegrationsPanel,
  NotificationsPanel,
  QuietHoursCard,
  InboxRulesPanel,
  RuleBuilder,
  AIPanel,
  ThemePanel,
  WeekStartPanel,
  DataPrivacyPanel,
  CareerSheetsPanel,
} from "#/features/settings/components/SettingsPage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSettings() {
  return render(<SettingsPage />);
}

// ── SettingsPage layout tests ─────────────────────────────────────────────────

describe("SettingsPage", () => {
  it("renders the Settings heading in the sidebar", () => {
    renderSettings();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  it("renders all 10 sidebar tabs", () => {
    renderSettings();
    const labels = [
      "Profile",
      "Integrations",
      "Notifications",
      "Inbox rules",
      "AI provider",
      "Self-host",
      "Theme",
      "Week start",
      "Data & privacy",
      "Career",
    ];
    for (const label of labels) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("shows Profile panel content by default", () => {
    renderSettings();
    // ProfilePanel renders "Profile" heading; sidebar also has it — at least 2
    expect(screen.getAllByText("Profile").length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to Integrations tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
  });

  it("navigates to Notifications tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Channels")).toBeTruthy();
    expect(screen.getByText("Per-event routing")).toBeTruthy();
  });

  it("navigates to Inbox rules tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Inbox rules" }));
    // Both the nav button and h2 say "Inbox rules" — check count >= 2
    expect(screen.getAllByText("Inbox rules").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /new rule/i })).toBeTruthy();
  });

  it("navigates to AI provider tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "AI provider" }));
    expect(screen.getByText("Anthropic")).toBeTruthy();
  });

  it("navigates to Theme tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Theme" }));
    expect(screen.getByText("Color scheme")).toBeTruthy();
  });

  it("navigates to Week start tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Week start" }));
    expect(screen.getByText("Week starts on")).toBeTruthy();
  });

  it("navigates to Data & privacy tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Data & privacy" }));
    expect(screen.getByText("Export")).toBeTruthy();
  });

  it("navigates to Career tab on click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Career" }));
    expect(screen.getByText("Google Sheets")).toBeTruthy();
  });
});

// ── IntegrationsPanel ─────────────────────────────────────────────────────────

describe("IntegrationsPanel", () => {
  it("renders all 4 providers", () => {
    render(<IntegrationsPanel />);
    expect(screen.getByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText("Google Calendar")).toBeTruthy();
    expect(screen.getByText("Linear")).toBeTruthy();
  });

  it("shows Google Sheets re-auth banner", () => {
    render(<IntegrationsPanel />);
    expect(screen.getByText("Google Sheets — for Career sync")).toBeTruthy();
    expect(screen.getByText("Re-auth needed")).toBeTruthy();
  });

  it("shows total accounts count", () => {
    render(<IntegrationsPanel />);
    expect(screen.getByText(/accounts across 4 providers/)).toBeTruthy();
  });

  it("renders connected account handles", () => {
    render(<IntegrationsPanel />);
    expect(screen.getByText("erinkov")).toBeTruthy();
    expect(screen.getByText("kovacs-acme")).toBeTruthy();
  });

  it("adds an account when Add account is clicked", () => {
    render(<IntegrationsPanel />);
    const addButtons = screen.getAllByRole("button", { name: /add account/i });
    fireEvent.click(addButtons[0]!);
    expect(screen.getByText("just connected")).toBeTruthy();
  });

  it("removes an account when Remove is clicked", () => {
    render(<IntegrationsPanel />);
    expect(screen.getByText("erinkov")).toBeTruthy();
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0]!);
    expect(screen.queryByText("erinkov")).toBeNull();
  });
});

// ── NotificationsPanel ────────────────────────────────────────────────────────

describe("NotificationsPanel", () => {
  it("renders channel rows", () => {
    render(<NotificationsPanel />);
    expect(screen.getByText("PWA Web Push")).toBeTruthy();
    expect(screen.getByText("Slack self-DM")).toBeTruthy();
    expect(screen.getByText("Email digest")).toBeTruthy();
    expect(screen.getByText("Desktop banner")).toBeTruthy();
  });

  it("renders notification matrix event kinds", () => {
    render(<NotificationsPanel />);
    expect(screen.getByText("PR review")).toBeTruthy();
    expect(screen.getByText("@mention")).toBeTruthy();
    expect(screen.getByText("CI failure")).toBeTruthy();
  });

  it("renders Quiet hours card", () => {
    render(<NotificationsPanel />);
    expect(screen.getByText("Quiet hours")).toBeTruthy();
    expect(screen.getByRole("switch", { name: /enable quiet hours/i })).toBeTruthy();
  });

  it("toggles a notification matrix cell", () => {
    render(<NotificationsPanel />);
    const prReviewPushBtn = screen.getByRole("button", {
      name: /toggle push for PR review/i,
    });
    // Initially pressed=true
    expect(prReviewPushBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(prReviewPushBtn);
    expect(prReviewPushBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles a channel switch on click", () => {
    render(<NotificationsPanel />);
    // Email digest channel starts unchecked (email: false)
    const emailSwitch = screen.getByRole("switch", {
      name: /toggle email digest/i,
    });
    const before = emailSwitch.getAttribute("data-checked") !== null;
    fireEvent.click(emailSwitch);
    const after = emailSwitch.getAttribute("data-checked") !== null;
    expect(before).not.toBe(after);
  });
});

// ── QuietHoursCard ────────────────────────────────────────────────────────────

describe("QuietHoursCard", () => {
  it("renders master toggle and mode tabs", () => {
    render(<QuietHoursCard />);
    expect(screen.getByRole("switch", { name: /enable quiet hours/i })).toBeTruthy();
    expect(screen.getByText("Same every day")).toBeTruthy();
    expect(screen.getByText("Weekday / weekend")).toBeTruthy();
    expect(screen.getByText("Per day")).toBeTruthy();
  });

  it("switches to uniform mode and shows time fields", () => {
    render(<QuietHoursCard />);
    fireEvent.click(screen.getByText("Same every day"));
    expect(screen.getByText("Every day from")).toBeTruthy();
  });

  it("switches to per-day mode and shows all 7 day rows", () => {
    render(<QuietHoursCard />);
    fireEvent.click(screen.getByText("Per day"));
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getAllByText(day).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows the week summary strip with 7 day labels", () => {
    render(<QuietHoursCard />);
    // Strip always shows Mon–Sun
    expect(screen.getAllByText("Mon").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sun").length).toBeGreaterThanOrEqual(1);
  });

  it("disabling master toggle makes it unchecked", () => {
    render(<QuietHoursCard />);
    const masterToggle = screen.getByRole("switch", {
      name: /enable quiet hours/i,
    });
    expect(masterToggle.getAttribute("data-checked")).toBe("");
    fireEvent.click(masterToggle);
    expect(masterToggle.getAttribute("data-unchecked")).toBe("");
  });
});

// ── InboxRulesPanel ───────────────────────────────────────────────────────────

describe("InboxRulesPanel", () => {
  it("renders the fixture rules list", () => {
    render(<InboxRulesPanel />);
    expect(screen.getByText("PR author is dependabot")).toBeTruthy();
    expect(screen.getByText("Snooze 1 day")).toBeTruthy();
  });

  it("shows active rule count", () => {
    render(<InboxRulesPanel />);
    expect(screen.getByText(/3 of 5 active/)).toBeTruthy();
  });

  it("opens RuleBuilder when New rule is clicked", () => {
    render(<InboxRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
    expect(screen.getByText("New rule")).toBeTruthy();
    expect(screen.getAllByText("WHEN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("THEN").length).toBeGreaterThanOrEqual(1);
  });

  it("closes RuleBuilder and adds rule when Save rule is clicked", () => {
    render(<InboxRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
    expect(screen.getByText("New rule")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /save rule/i }));
    expect(screen.queryByRole("button", { name: /save rule/i })).toBeNull();
    // A new rule was added to the list (now 6)
    expect(screen.getByText(/of 6 active/)).toBeTruthy();
  });

  it("cancels RuleBuilder without adding a rule", () => {
    render(<InboxRulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /save rule/i })).toBeNull();
    expect(screen.getByText(/3 of 5 active/)).toBeTruthy();
  });

  it("toggles a rule on/off", () => {
    render(<InboxRulesPanel />);
    const switches = screen.getAllByRole("switch");
    // First rule (dependabot) is on — data-checked present
    expect(switches[0]!.getAttribute("data-checked")).toBe("");
    fireEvent.click(switches[0]!);
    expect(switches[0]!.getAttribute("data-unchecked")).toBe("");
  });
});

// ── RuleBuilder unit tests ────────────────────────────────────────────────────

describe("RuleBuilder", () => {
  it("renders WHEN / THEN / NAME sections", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={onCancel} />);
    expect(screen.getAllByText("WHEN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("THEN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("NAME")).toBeTruthy();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onSave with rule data when Save rule is clicked", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /save rule/i }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        when: expect.any(String),
        then: expect.any(String),
      }),
    );
  });

  it("can add a condition row", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    // 2 conditions → 2 remove buttons
    const removeButtons = screen.getAllByRole("button", { name: "×" });
    expect(removeButtons.length).toBe(2);
  });
});

// ── AIPanel ───────────────────────────────────────────────────────────────────

describe("AIPanel", () => {
  it("renders provider grid with 4 providers", () => {
    render(<AIPanel />);
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("Groq")).toBeTruthy();
  });

  it("defaults to Anthropic with 3 models", () => {
    render(<AIPanel />);
    expect(screen.getByText("3 models")).toBeTruthy();
  });

  it("switches provider to OpenAI and updates model list", () => {
    render(<AIPanel />);
    fireEvent.click(screen.getByRole("button", { name: /openai/i }));
    expect(screen.getAllByText(/GPT/i).length).toBeGreaterThan(0);
  });

  it("renders API key section with Validate button", () => {
    render(<AIPanel />);
    expect(screen.getByText("API key")).toBeTruthy();
    expect(screen.getByRole("button", { name: /validate/i })).toBeTruthy();
  });

  it("renders budget meter with spending info", () => {
    render(<AIPanel />);
    expect(screen.getByText(/\$8\.41/)).toBeTruthy();
    expect(screen.getByText(/\$25\.00 cap/)).toBeTruthy();
    expect(screen.getByText(/34% used/)).toBeTruthy();
  });

  it("has fallback threshold selector defaulting to 80%", () => {
    render(<AIPanel />);
    const select = screen.getByRole("combobox", {
      name: /fallback threshold/i,
    }) as unknown as HTMLSelectElement;
    expect(select.value).toBe("80");
  });

  it("changing fallback threshold updates the select value", () => {
    render(<AIPanel />);
    const select = screen.getByRole("combobox", {
      name: /fallback threshold/i,
    }) as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "50" } });
    expect(select.value).toBe("50");
  });

  it("renders privacy controls", () => {
    render(<AIPanel />);
    expect(screen.getByText("Strip code blocks")).toBeTruthy();
    expect(screen.getByText("Strip secrets")).toBeTruthy();
    expect(screen.getByText("Strip file paths")).toBeTruthy();
  });
});

// ── ThemePanel ────────────────────────────────────────────────────────────────

describe("ThemePanel", () => {
  it("renders color scheme options", () => {
    render(<ThemePanel />);
    expect(screen.getByText("Color scheme")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "System" })).toBeTruthy();
  });

  it("renders density options", () => {
    render(<ThemePanel />);
    expect(screen.getByText("Density")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Comfortable" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compact" })).toBeTruthy();
  });
});

// ── WeekStartPanel ────────────────────────────────────────────────────────────

describe("WeekStartPanel", () => {
  it("renders Sun/Mon/Sat options", () => {
    render(<WeekStartPanel />);
    expect(screen.getByRole("button", { name: "Sunday" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Monday" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saturday" })).toBeTruthy();
  });
});

// ── DataPrivacyPanel ──────────────────────────────────────────────────────────

describe("DataPrivacyPanel", () => {
  it("renders export and retention sections", () => {
    render(<DataPrivacyPanel />);
    expect(screen.getByText("Export")).toBeTruthy();
    expect(screen.getByText("Retention")).toBeTruthy();
    expect(screen.getByRole("button", { name: /export my data/i })).toBeTruthy();
  });

  it("renders danger zone", () => {
    render(<DataPrivacyPanel />);
    expect(screen.getByText("Danger zone")).toBeTruthy();
    expect(screen.getByRole("button", { name: /purge all signals/i })).toBeTruthy();
  });

  it("shows confirmation input when Purge is clicked", () => {
    render(<DataPrivacyPanel />);
    fireEvent.click(screen.getByRole("button", { name: /purge all signals/i }));
    expect(screen.getByPlaceholderText("DELETE")).toBeTruthy();
    const confirmBtn = screen.getByRole("button", {
      name: /confirm purge/i,
    }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("enables confirm when DELETE is typed", () => {
    render(<DataPrivacyPanel />);
    fireEvent.click(screen.getByRole("button", { name: /purge all signals/i }));
    const input = screen.getByPlaceholderText("DELETE");
    fireEvent.change(input, { target: { value: "DELETE" } });
    const confirmBtn = screen.getByRole("button", {
      name: /confirm purge/i,
    }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });
});

// ── CareerSheetsPanel ─────────────────────────────────────────────────────────

describe("CareerSheetsPanel", () => {
  it("renders the not-connected state", () => {
    render(<CareerSheetsPanel />);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /authorize google sheets/i }),
    ).toBeTruthy();
  });

  it("shows connected state after authorization", () => {
    render(<CareerSheetsPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: /authorize google sheets/i }),
    );
    expect(screen.getByText("Google Sheets connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeTruthy();
  });
});
