import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type ExportPayload,
  PURGE_CONFIRMATION,
  type RetentionView,
} from "#/lib/data-privacy-api";
import { PROFILE_UPDATED_EVENT } from "#/lib/profile-api";
import { THEME_UPDATED_EVENT, type ThemeView } from "#/lib/theme-api";
import {
  AiProviderPanel,
  AiSafeguardsPanel,
  DataPrivacyPanel,
  EmailDigestPanel,
  FocusBlockPanel,
  NotificationMatrixPanel,
  NotificationsPanel,
  ProfilePanel,
  QuietHoursPanel,
  ThemePanel,
  WebPushDevicesPanel,
} from "#/routes/_app.settings";

describe("NotificationsPanel", () => {
  it("loads the current alert channels and reflects them in the toggle", async () => {
    const loader = vi.fn(async () => ({ alert_channels: ["slack_dm"] }));
    const saver = vi.fn(async (cs: string[]) => ({ alert_channels: cs }));
    const tester = vi.fn(async () => ({ ok: true }));
    render(
      <NotificationsPanel loader={loader} saver={saver} tester={tester} />,
    );
    const toggle = (await screen.findByRole("checkbox", {
      name: /slack self-dm/i,
    })) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("persists toggle changes through the saver", async () => {
    const loader = vi.fn(async () => ({ alert_channels: [] }));
    const saver = vi.fn(async (cs: string[]) => ({ alert_channels: cs }));
    render(<NotificationsPanel loader={loader} saver={saver} />);
    const toggle = (await screen.findByRole("checkbox", {
      name: /slack self-dm/i,
    })) as HTMLInputElement;
    fireEvent.click(toggle);
    await waitFor(() => expect(saver).toHaveBeenCalledWith(["slack_dm"]));
  });

  it("fires a test notification through the tester and surfaces success", async () => {
    const loader = vi.fn(async () => ({ alert_channels: ["slack_dm"] }));
    const tester = vi.fn(async () => ({ ok: true }));
    render(<NotificationsPanel loader={loader} tester={tester} />);
    const button = await screen.findByRole("button", {
      name: /send test notification/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /test notification sent/i,
      ),
    );
    expect(tester).toHaveBeenCalledTimes(1);
  });

  it("surfaces tester errors", async () => {
    const loader = vi.fn(async () => ({ alert_channels: ["slack_dm"] }));
    const tester = vi.fn(async () => ({
      ok: false,
      error: "channel_not_found",
    }));
    render(<NotificationsPanel loader={loader} tester={tester} />);
    const button = await screen.findByRole("button", {
      name: /send test notification/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /channel_not_found/,
      ),
    );
  });

  it("disables the test button when slack_dm is not enabled", async () => {
    const loader = vi.fn(async () => ({ alert_channels: [] }));
    render(<NotificationsPanel loader={loader} />);
    const button = await screen.findByRole("button", {
      name: /send test notification/i,
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("AiProviderPanel", () => {
  it("renders all five provider tiles and marks the active one", async () => {
    const loader = vi.fn(async () => ({
      provider: "openai" as const,
      default_model: "gpt-4o-mini",
      base_url: null,
      has_api_key: true,
      last_validated_at: null,
    }));
    render(<AiProviderPanel loader={loader} />);
    const openai = await screen.findByRole("button", { name: /openai/i });
    expect(openai.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /anthropic/i })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: /gemini/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /groq/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ollama/i })).toBeTruthy();
  });

  it("does not render the API key field when ollama is active", async () => {
    const loader = vi.fn(async () => ({
      provider: "ollama" as const,
      default_model: "llama3",
      base_url: "http://localhost:11434",
      has_api_key: false,
      last_validated_at: null,
    }));
    render(<AiProviderPanel loader={loader} />);
    await screen.findByRole("button", { name: /ollama/i });
    expect(screen.queryByLabelText(/api key/i)).toBeNull();
    expect(screen.getByLabelText(/base url/i)).toBeTruthy();
  });

  it("save sends the typed key + model to the saver", async () => {
    const loader = vi.fn(async () => ({
      provider: "openai" as const,
      default_model: "gpt-4o-mini",
      base_url: null,
      has_api_key: false,
      last_validated_at: null,
    }));
    const saver = vi.fn(async () => ({
      provider: "openai" as const,
      default_model: "gpt-4o",
      base_url: null,
      has_api_key: true,
      last_validated_at: null,
    }));
    render(<AiProviderPanel loader={loader} saver={saver} />);
    const keyInput = (await screen.findByLabelText(
      /api key/i,
    )) as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: "sk-real" } });
    const modelInput = screen.getByLabelText(
      /default model/i,
    ) as HTMLInputElement;
    fireEvent.change(modelInput, { target: { value: "gpt-4o" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          default_model: "gpt-4o",
          api_key: "sk-real",
        }),
      ),
    );
  });

  it("test connection surfaces success and reloads", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        provider: "openai" as const,
        default_model: "gpt-4o-mini",
        base_url: null,
        has_api_key: true,
        last_validated_at: null,
      })
      .mockResolvedValueOnce({
        provider: "openai" as const,
        default_model: "gpt-4o-mini",
        base_url: null,
        has_api_key: true,
        last_validated_at: "2026-05-04T13:00:00Z",
      });
    const tester = vi.fn(async () => ({ ok: true, model: "gpt-4o-mini" }));
    render(<AiProviderPanel loader={loader} tester={tester} />);
    const button = await screen.findByRole("button", {
      name: /test connection/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /connected.*gpt-4o-mini/i,
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/last validated/i)).toBeTruthy(),
    );
  });

  it("test connection surfaces provider error", async () => {
    const loader = vi.fn(async () => ({
      provider: "openai" as const,
      default_model: "gpt-4o-mini",
      base_url: null,
      has_api_key: true,
      last_validated_at: null,
    }));
    const tester = vi.fn(async () => ({
      ok: false,
      error: "401 unauthorized",
    }));
    render(<AiProviderPanel loader={loader} tester={tester} />);
    const button = await screen.findByRole("button", {
      name: /test connection/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /401 unauthorized/i,
      ),
    );
  });
});

describe("AiSafeguardsPanel", () => {
  const baseView = {
    provider: "openai" as const,
    default_model: "gpt-4o",
    base_url: null,
    has_api_key: true,
    last_validated_at: null,
    monthly_budget_usd: 25,
    fallback_model: "gpt-4o-mini",
    privacy_mode: false,
    redact_patterns: [],
    ai_disabled: false,
    month_spent_usd: 5,
  };

  it("renders spend / budget and shows the green bar below 80%", async () => {
    render(<AiSafeguardsPanel loader={async () => baseView} />);
    await waitFor(() =>
      expect(screen.getByText(/\$5\.00 of \$25\.00/)).toBeTruthy(),
    );
    // No fallback or budget-reached banner below 80%.
    expect(screen.queryByText(/running on fallback/i)).toBeNull();
    expect(screen.queryByText(/budget reached/i)).toBeNull();
  });

  it("shows the 'fallback model' banner at ≥80% of budget", async () => {
    render(
      <AiSafeguardsPanel
        loader={async () => ({ ...baseView, month_spent_usd: 22 })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/running on fallback model/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/budget reached/i)).toBeNull();
  });

  it("shows the 'AI disabled — monthly budget reached' banner at 100%", async () => {
    render(
      <AiSafeguardsPanel
        loader={async () => ({ ...baseView, month_spent_usd: 30 })}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/ai disabled — monthly budget reached/i),
      ).toBeTruthy(),
    );
  });

  it("saves the budget + fallback through the saver", async () => {
    const saver = vi.fn(async () => baseView);
    render(<AiSafeguardsPanel loader={async () => baseView} saver={saver} />);
    const budgetInput = (await screen.findByLabelText(
      /monthly budget/i,
    )) as HTMLInputElement;
    fireEvent.change(budgetInput, { target: { value: "50" } });
    const fallbackInput = screen.getByLabelText(
      /fallback model/i,
    ) as HTMLInputElement;
    fireEvent.change(fallbackInput, { target: { value: "gpt-4o-mini" } });
    fireEvent.click(screen.getByRole("button", { name: /save budget/i }));
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          monthly_budget_usd: 50,
          fallback_model: "gpt-4o-mini",
        }),
      ),
    );
  });

  it("toggles privacy mode through the saver", async () => {
    const saver = vi.fn(async () => ({ ...baseView, privacy_mode: true }));
    render(<AiSafeguardsPanel loader={async () => baseView} saver={saver} />);
    const toggle = (await screen.findByLabelText(
      /redact sensitive content/i,
    )) as HTMLInputElement;
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          privacy_mode: true,
        }),
      ),
    );
  });

  it("toggles 'Disable AI' through the saver", async () => {
    const saver = vi.fn(async () => ({ ...baseView, ai_disabled: true }));
    render(<AiSafeguardsPanel loader={async () => baseView} saver={saver} />);
    const toggle = (await screen.findByLabelText(
      /disable ai on this account/i,
    )) as HTMLInputElement;
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          ai_disabled: true,
        }),
      ),
    );
  });

  it("saves redact patterns parsed line-by-line", async () => {
    const saver = vi.fn(async () => baseView);
    render(<AiSafeguardsPanel loader={async () => baseView} saver={saver} />);
    const textarea = (await screen.findByLabelText(
      /custom redaction patterns/i,
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "acme-[a-z]+\n\n  secret  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save patterns/i }));
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          redact_patterns: ["acme-[a-z]+", "secret"],
        }),
      ),
    );
  });
});

const basePrefs = {
  alert_channels: ["slack_dm"],
  notification_matrix: {
    mention: ["slack_dm"],
    meeting: ["slack_dm"],
  },
  quiet_hours_v2: {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    start: "22:00",
    end: "08:00",
    utc_offset_minutes: 0,
    allow_through: [{ kind: "mention" }],
  },
  focus_block: {
    enabled: true,
    allow_mentions: true,
    allow_imminent_meeting_minutes: 5,
  },
};

describe("NotificationMatrixPanel", () => {
  it("toggles a kind × channel cell and persists the new matrix", async () => {
    const saver = vi.fn(async () => basePrefs);
    render(
      <NotificationMatrixPanel loader={async () => basePrefs} saver={saver} />,
    );
    const cell = await screen.findByLabelText("Slack mentions via Push");
    expect((cell as HTMLInputElement).checked).toBe(false);
    fireEvent.click(cell);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_matrix: expect.objectContaining({
            mention: ["slack_dm", "web_push"],
          }),
        }),
      ),
    );
  });
});

describe("QuietHoursPanel", () => {
  it("toggles a day chip and persists", async () => {
    const saver = vi.fn(async () => basePrefs);
    render(<QuietHoursPanel loader={async () => basePrefs} saver={saver} />);
    const sat = await screen.findByRole("button", { name: /Quiet on Sat/i });
    fireEvent.click(sat);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          quiet_hours_v2: expect.objectContaining({
            days: expect.arrayContaining([6]),
          }),
        }),
      ),
    );
  });
});

describe("FocusBlockPanel", () => {
  it("toggles allow_mentions and persists", async () => {
    const saver = vi.fn(async () => basePrefs);
    render(<FocusBlockPanel loader={async () => basePrefs} saver={saver} />);
    const allow = await screen.findByLabelText(/let mentions and dms through/i);
    fireEvent.click(allow);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith(
        expect.objectContaining({
          focus_block: expect.objectContaining({ allow_mentions: false }),
        }),
      ),
    );
  });
});

import type { InboxRule } from "#/lib/inbox-rules-engine";
import { InboxRulesPanel } from "#/routes/_app.settings";

describe("InboxRulesPanel", () => {
  const sampleRule: InboxRule = {
    id: "r-1",
    name: "Snooze deps",
    enabled: true,
    priority: 1,
    predicates: [
      { type: "source_match", field: "author", equals: "dependabot" },
    ],
    effects: [{ type: "snooze", minutes: 60 }],
  };

  it("loads existing rules and renders one row per rule", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn();
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const name = (await screen.findByLabelText(
      "Rule name",
    )) as HTMLInputElement;
    expect(name.value).toBe("Snooze deps");
  });

  it("adds a new rule through the saver when 'Add rule' is clicked", async () => {
    const loader = vi.fn(async () => ({ rules: [] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const add = await screen.findByRole("button", { name: /add rule/i });
    fireEvent.click(add);
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const saved = saver.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("New rule");
  });

  it("deletes a rule through the saver", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    const del = await screen.findByRole("button", { name: /delete rule/i });
    fireEvent.click(del);
    await waitFor(() => expect(saver).toHaveBeenCalledWith([]));
  });

  it("toggles enabled state", async () => {
    const loader = vi.fn(async () => ({ rules: [sampleRule] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findByLabelText("Rule name");
    const enabled = screen.getByLabelText(/enabled/i) as HTMLInputElement;
    fireEvent.click(enabled);
    await waitFor(() =>
      expect(saver).toHaveBeenCalledWith([
        expect.objectContaining({ enabled: false }),
      ]),
    );
  });

  it("surfaces saver-reported errors", async () => {
    const loader = vi.fn(async () => ({ rules: [] }));
    const saver = vi.fn(async () => ({ ok: false, error: "boom" }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    fireEvent.click(await screen.findByRole("button", { name: /add rule/i }));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy());
  });

  it("reorders rules via the move buttons", async () => {
    const r1 = { ...sampleRule, id: "a", name: "A", priority: 1 };
    const r2 = { ...sampleRule, id: "b", name: "B", priority: 2 };
    const loader = vi.fn(async () => ({ rules: [r1, r2] }));
    const saver = vi.fn(async (rules: InboxRule[]) => ({ ok: true, rules }));
    render(<InboxRulesPanel loader={loader} saver={saver} />);
    await screen.findAllByLabelText("Rule name");
    const moveDownButtons = screen.getAllByRole("button", {
      name: /move down/i,
    });
    fireEvent.click(moveDownButtons[0]);
    await waitFor(() => expect(saver).toHaveBeenCalled());
    const saved = saver.mock.calls[0][0];
    expect(saved.map((r: InboxRule) => r.id)).toEqual(["b", "a"]);
  });
});

describe("WebPushDevicesPanel", () => {
  const sample = {
    id: "dev-1",
    endpoint: "https://x/1",
    device_label: "Chrome on macOS",
    last_delivered_at: null,
    created_at: "2026-05-04T00:00:00Z",
  };

  it("loads and renders devices with their labels", async () => {
    const loader = vi.fn(async () => ({ devices: [sample] }));
    render(<WebPushDevicesPanel loader={loader} />);
    expect(await screen.findByText(/chrome on macos/i)).toBeTruthy();
    expect(screen.getByText(/never delivered/i)).toBeTruthy();
  });

  it("registers the current device and prepends the result", async () => {
    const loader = vi.fn(async () => ({ devices: [] }));
    const register = vi.fn(async () => sample);
    render(<WebPushDevicesPanel loader={loader} register={register} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /register this device/i }),
    );
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(await screen.findByText(/chrome on macos/i)).toBeTruthy();
  });

  it("removes a device through the remover", async () => {
    const loader = vi.fn(async () => ({ devices: [sample] }));
    const remover = vi.fn(async () => {});
    render(<WebPushDevicesPanel loader={loader} remover={remover} />);
    fireEvent.click(await screen.findByRole("button", { name: /remove/i }));
    await waitFor(() => expect(remover).toHaveBeenCalledWith("dev-1"));
    await waitFor(() =>
      expect(screen.queryByText(/chrome on macos/i)).toBeNull(),
    );
  });

  it("surfaces registration errors", async () => {
    const loader = vi.fn(async () => ({ devices: [] }));
    const register = vi.fn(async () => {
      throw new Error("permission denied");
    });
    render(<WebPushDevicesPanel loader={loader} register={register} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /register this device/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/permission denied/i)).toBeTruthy(),
    );
  });
});

describe("EmailDigestPanel", () => {
  const baseView = {
    enabled: false,
    transport: "resend" as const,
    has_api_key: false,
    from_email: null as string | null,
    to_email: null as string | null,
    hour_utc: 13,
    last_sent_date: null as string | null,
  };

  it("loads the current settings and pre-fills the form", async () => {
    const loader = vi.fn(async () => ({
      ...baseView,
      enabled: true,
      has_api_key: true,
      from_email: "from@example.com",
      to_email: "to@example.com",
      hour_utc: 9,
      last_sent_date: "2026-05-03",
    }));
    render(<EmailDigestPanel loader={loader} />);
    const fromInput = (await screen.findByLabelText(
      /from address/i,
    )) as HTMLInputElement;
    expect(fromInput.value).toBe("from@example.com");
    expect(
      (screen.getByLabelText(/to address/i) as HTMLInputElement).value,
    ).toBe("to@example.com");
    expect(
      (screen.getByLabelText(/send hour/i) as HTMLInputElement).value,
    ).toBe("9");
    expect(screen.getByText(/last digest sent on 2026-05-03/i)).toBeTruthy();
  });

  it("toggles enabled through the saver", async () => {
    const loader = vi.fn(async () => baseView);
    const saver = vi.fn(async (body: { enabled?: boolean }) => ({
      ok: true as const,
      settings: { ...baseView, enabled: !!body.enabled },
    }));
    render(<EmailDigestPanel loader={loader} saver={saver} />);
    const toggle = (await screen.findByRole("checkbox", {
      name: /daily digest/i,
    })) as HTMLInputElement;
    fireEvent.click(toggle);
    await waitFor(() => expect(saver).toHaveBeenCalledWith({ enabled: true }));
  });

  it("forwards api_key + from + to + hour on Save", async () => {
    const loader = vi.fn(async () => baseView);
    const saver = vi.fn(
      async (
        body: Record<string, unknown>,
      ): Promise<
        { ok: true; settings: typeof baseView } | { ok: false; error: string }
      > => ({
        ok: true,
        settings: {
          ...baseView,
          has_api_key: !!body.api_key,
          from_email: (body.from_email as string) ?? null,
          to_email: (body.to_email as string) ?? null,
          hour_utc: (body.hour_utc as number) ?? 13,
        },
      }),
    );
    render(<EmailDigestPanel loader={loader} saver={saver} />);
    const fromInput = (await screen.findByLabelText(
      /from address/i,
    )) as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: "from@example.com" } });
    fireEvent.change(screen.getByLabelText(/to address/i), {
      target: { value: "to@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/send hour/i), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText(/resend api key/i), {
      target: { value: "re_real" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(saver).toHaveBeenCalled());
    expect(saver.mock.calls[0][0]).toEqual({
      from_email: "from@example.com",
      to_email: "to@example.com",
      hour_utc: 8,
      api_key: "re_real",
    });
  });

  it("disables Send test until an api_key is configured", async () => {
    const loader = vi.fn(async () => baseView);
    render(<EmailDigestPanel loader={loader} />);
    const button = (await screen.findByRole("button", {
      name: /send test email/i,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls the tester and surfaces success", async () => {
    const loader = vi.fn(async () => ({ ...baseView, has_api_key: true }));
    const tester = vi.fn(async () => ({ ok: true }));
    render(<EmailDigestPanel loader={loader} tester={tester} />);
    const button = await screen.findByRole("button", {
      name: /send test email/i,
    });
    fireEvent.click(button);
    await waitFor(() => expect(tester).toHaveBeenCalled());
    expect(await screen.findByText(/test email sent/i)).toBeTruthy();
  });

  it("surfaces tester errors", async () => {
    const loader = vi.fn(async () => ({ ...baseView, has_api_key: true }));
    const tester = vi.fn(async () => ({ ok: false, error: "401 invalid key" }));
    render(<EmailDigestPanel loader={loader} tester={tester} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /send test email/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/401 invalid key/i)).toBeTruthy(),
    );
  });
});

describe("ProfilePanel", () => {
  const view = {
    display_name: "Devy",
    timezone: "Europe/Paris",
    locale: "en-US",
    avatar_url: null,
  };

  it("loads the profile and prefills the inputs", async () => {
    const loader = vi.fn(async () => view);
    render(<ProfilePanel loader={loader} />);
    const nameInput = (await screen.findByLabelText(
      /display name/i,
    )) as HTMLInputElement;
    expect(nameInput.value).toBe("Devy");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("saves edits and dispatches the profile-updated event", async () => {
    const loader = vi.fn(async () => view);
    const saver = vi.fn(async (patch: { display_name?: string | null }) => ({
      ok: true as const,
      profile: { ...view, display_name: patch.display_name ?? null },
    }));
    const onUpdate = vi.fn();
    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdate);
    try {
      render(<ProfilePanel loader={loader} saver={saver} />);
      const nameInput = (await screen.findByLabelText(
        /display name/i,
      )) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "New Name" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));
      await waitFor(() => expect(saver).toHaveBeenCalled());
      expect(saver).toHaveBeenCalledWith({
        display_name: "New Name",
        timezone: "Europe/Paris",
        locale: "en-US",
        avatar_url: null,
      });
      await waitFor(() =>
        expect(screen.getByRole("status").textContent).toMatch(/saved/i),
      );
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdate);
    }
  });

  it("surfaces a validation error from the saver", async () => {
    const loader = vi.fn(async () => view);
    const saver = vi.fn(async () => ({
      ok: false as const,
      error: "display_name must be at most 200 characters",
    }));
    render(<ProfilePanel loader={loader} saver={saver} />);
    await screen.findByLabelText(/display name/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(screen.getByText(/at most 200 characters/i)).toBeTruthy(),
    );
  });
});

describe("ThemePanel", () => {
  const initial: ThemeView = {
    theme: "system",
    density: "comfortable",
    accent: "rausch",
  };

  it("loads the saved theme and reflects it in the radios", async () => {
    const loader = vi.fn(
      async () =>
        ({
          theme: "dark",
          density: "compact",
          accent: "ocean",
        }) as ThemeView,
    );
    render(<ThemePanel loader={loader} />);
    const darkRadio = (await screen.findByRole("radio", {
      name: /dark/i,
    })) as HTMLInputElement;
    expect(darkRadio.checked).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("saves on radio change and dispatches the theme-updated event", async () => {
    const loader = vi.fn(async () => initial);
    const saver = vi.fn(async (patch: ThemeView) => ({
      ok: true as const,
      theme: patch,
    }));
    const onUpdate = vi.fn();
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    try {
      render(<ThemePanel loader={loader} saver={saver} />);
      const darkRadio = (await screen.findByRole("radio", {
        name: /dark/i,
      })) as HTMLInputElement;
      fireEvent.click(darkRadio);
      await waitFor(() => expect(saver).toHaveBeenCalled());
      expect(saver).toHaveBeenCalledWith({
        theme: "dark",
        density: "comfortable",
        accent: "rausch",
      });
      await waitFor(() =>
        expect(screen.getByRole("status").textContent).toMatch(/saved/i),
      );
      expect(onUpdate).toHaveBeenCalled();
    } finally {
      window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
    }
  });

  it("persists density + accent independently", async () => {
    const loader = vi.fn(async () => initial);
    const saver = vi.fn(async (patch: ThemeView) => ({
      ok: true as const,
      theme: patch,
    }));
    render(<ThemePanel loader={loader} saver={saver} />);
    const compactRadio = (await screen.findByRole("radio", {
      name: /compact/i,
    })) as HTMLInputElement;
    fireEvent.click(compactRadio);
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        expect.objectContaining({ density: "compact" }),
      ),
    );

    const oceanRadio = (await screen.findByRole("radio", {
      name: /ocean/i,
    })) as HTMLInputElement;
    fireEvent.click(oceanRadio);
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        expect.objectContaining({ accent: "ocean" }),
      ),
    );
  });

  it("surfaces a validation error from the saver", async () => {
    const loader = vi.fn(async () => initial);
    const saver = vi.fn(async () => ({
      ok: false as const,
      error: "theme must be one of light, dark, system",
    }));
    render(<ThemePanel loader={loader} saver={saver} />);
    const lightRadio = (await screen.findByRole("radio", {
      name: /light/i,
    })) as HTMLInputElement;
    fireEvent.click(lightRadio);
    await waitFor(() =>
      expect(screen.getByText(/theme must be one of/i)).toBeTruthy(),
    );
  });
});

describe("DataPrivacyPanel", () => {
  const initial: RetentionView = { retention_days: 90 };

  it("loads the retention value into the input", async () => {
    const retentionLoader = vi.fn(async () => ({ retention_days: 30 }));
    render(<DataPrivacyPanel retentionLoader={retentionLoader} />);
    const input = (await screen.findByLabelText(
      /retention \(days\)/i,
    )) as HTMLInputElement;
    expect(input.value).toBe("30");
    expect(retentionLoader).toHaveBeenCalledTimes(1);
  });

  it("saves a new retention through the saver", async () => {
    const retentionLoader = vi.fn(async () => initial);
    const retentionSaver = vi.fn(async (patch: RetentionView) => ({
      ok: true as const,
      retention: patch,
    }));
    render(
      <DataPrivacyPanel
        retentionLoader={retentionLoader}
        retentionSaver={retentionSaver}
      />,
    );
    const input = (await screen.findByLabelText(
      /retention \(days\)/i,
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /save retention/i }));
    await waitFor(() =>
      expect(retentionSaver).toHaveBeenCalledWith({ retention_days: 45 }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/saved/i),
    );
  });

  it("invokes the exporter when Export is clicked", async () => {
    const payload: ExportPayload = {
      exported_at: "2026-05-04T10:00:00.000Z",
      signals: [],
      signal_rollups: [],
      inbox_rules: [],
      slack_channel_allowlist: [],
      user_preferences: null,
      ai_settings: null,
    };
    const exporter = vi.fn(async () => payload);
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    render(
      <DataPrivacyPanel
        exporter={exporter}
        retentionLoader={async () => initial}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /export all data/i }),
    );
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("requires the typed confirmation before purging", async () => {
    const purger = vi.fn(async () => ({
      ok: true as const,
      deleted: { signals: 3, signal_rollups: 1 },
    }));
    render(
      <DataPrivacyPanel
        purger={purger}
        retentionLoader={async () => initial}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /purge all data/i }),
    );
    await screen.findByRole("dialog", { name: /confirm purge/i });
    const confirmButton = (await screen.findByRole("button", {
      name: /confirm purge/i,
    })) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const input = (await screen.findByLabelText(
      /purge confirmation/i,
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirmButton.disabled).toBe(true);
    expect(purger).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: PURGE_CONFIRMATION } });
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);
    await waitFor(() =>
      expect(purger).toHaveBeenCalledWith(PURGE_CONFIRMATION),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/purged 3/i),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /confirm purge/i }),
      ).toBeNull(),
    );
  });

  it("surfaces a purge error from the server", async () => {
    const purger = vi.fn(async () => ({
      ok: false as const,
      error: 'confirmation must be the literal string "DELETE"',
    }));
    render(
      <DataPrivacyPanel
        purger={purger}
        retentionLoader={async () => initial}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /purge all data/i }),
    );
    const input = (await screen.findByLabelText(
      /purge confirmation/i,
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: PURGE_CONFIRMATION } });
    fireEvent.click(screen.getByRole("button", { name: /confirm purge/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/confirmation/i),
    );
  });
});
