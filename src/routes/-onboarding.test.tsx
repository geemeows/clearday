import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  OnboardingFlow,
  OnboardingHero,
  SlackAllowlistPanel,
} from "#/routes/onboarding";

function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const todayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/today",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([todayRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("OnboardingHero", () => {
  it("renders the Devy headline and one card per v1 provider", async () => {
    const loader = vi.fn(async () => ({ sources: [] as never[] }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: /welcome to devy/i }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/github provider card/i)).toBeTruthy();
    expect(screen.getByLabelText(/slack provider card/i)).toBeTruthy();
    expect(
      screen.getByLabelText(/google calendar provider card/i),
    ).toBeTruthy();
  });

  it("disables Continue until at least one provider is connected", async () => {
    const loader = vi.fn(async () => ({
      sources: [
        { provider: "github", status: "disconnected" as const },
        { provider: "slack", status: "disconnected" as const },
      ],
    }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
      />,
    );

    const cta = (await screen.findByRole("button", {
      name: /continue to devy/i,
    })) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("enables Continue once a provider is connected", async () => {
    const loader = vi.fn(async () => ({
      sources: [{ provider: "github", status: "connected" as const }],
    }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
      />,
    );

    const cta = (await screen.findByRole("button", {
      name: /continue to devy/i,
    })) as HTMLButtonElement;
    await waitFor(() => expect(cta.disabled).toBe(false));
  });

  it("Continue calls /api/onboarding/complete then onFinish", async () => {
    const complete = vi.fn(async () => ({ ok: true as const }));
    const onFinish = vi.fn();
    const loader = vi.fn(async () => ({
      sources: [{ provider: "github", status: "connected" as const }],
    }));
    render(
      <OnboardingHero
        onFinish={onFinish}
        complete={complete}
        loader={loader}
      />,
    );

    const cta = await screen.findByRole("button", {
      name: /continue to devy/i,
    });
    await waitFor(() =>
      expect((cta as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(cta);

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("Connect button forwards through connect-url and opens the URL", async () => {
    const loader = vi.fn(async () => ({ sources: [] as never[] }));
    const connectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://auth.example.com/start/github",
    }));
    const openUrl = vi.fn();
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
        connectUrl={connectUrl}
        openUrl={openUrl}
      />,
    );

    const buttons = await screen.findAllByRole("button", {
      name: /^connect$/i,
    });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(connectUrl).toHaveBeenCalled());
    expect(openUrl).toHaveBeenCalledWith(
      "https://auth.example.com/start/github",
    );
  });

  it("connected providers show a Reconnect button instead of Connect", async () => {
    const loader = vi.fn(async () => ({
      sources: [{ provider: "github", status: "connected" as const }],
    }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /reconnect/i }),
    ).toBeTruthy();
  });

  it("re-fetches sources when the tab becomes visible again", async () => {
    const loader = vi.fn(async () => ({
      sources: [{ provider: "github", status: "disconnected" as const }],
    }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
      />,
    );
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  });

  it("shows an error if connect-url fails", async () => {
    const loader = vi.fn(async () => ({ sources: [] as never[] }));
    const connectUrl = vi.fn(async () => ({
      ok: false,
      error: "auth-proxy not configured",
    }));
    render(
      <OnboardingHero
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
        loader={loader}
        connectUrl={connectUrl}
        openUrl={() => {}}
      />,
    );
    const buttons = await screen.findAllByRole("button", {
      name: /^connect$/i,
    });
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getByText(/auth-proxy not configured/i)).toBeTruthy(),
    );
  });
});

describe("OnboardingFlow", () => {
  const baseProps = () => ({
    onFinish: vi.fn(),
    complete: vi.fn(async () => ({ ok: true as const })),
    loader: vi.fn(async () => ({ sources: [] as never[] })),
    saveAiSettings: vi.fn(async () => ({ ok: true as const })),
    saveAlerts: vi.fn(async () => ({ ok: true as const })),
  });

  it("renders the 5-step stepper rail and Skip link", async () => {
    renderInRouter(<OnboardingFlow {...baseProps()} />);
    for (const name of [
      "Welcome",
      "Integrations",
      "AI provider",
      "Alerts",
      "Ready",
    ]) {
      const matches = await screen.findAllByText(name);
      expect(matches.length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/skip setup/i)).toBeTruthy();
    expect(screen.getAllByText(/step 1 of 5/i).length).toBeGreaterThan(0);
  });

  it("advances through steps with Continue and reaches Ready on step 5", async () => {
    renderInRouter(<OnboardingFlow {...baseProps()} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /connect your sources/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /you're all set/i });
    expect(screen.getByRole("button", { name: /open devy/i })).toBeTruthy();
  });

  it("persists AI provider + api key via saveAiSettings when leaving step 3", async () => {
    const saveAiSettings = vi.fn(async () => ({ ok: true as const }));
    const { container } = renderInRouter(
      <OnboardingFlow {...baseProps()} saveAiSettings={saveAiSettings} />,
    );
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    const openaiTile = container.querySelector('[data-provider="openai"]');
    if (!openaiTile) throw new Error("openai tile not found");
    fireEvent.click(openaiTile);
    fireEvent.change(screen.getByLabelText(/api key/i), {
      target: { value: "sk-test-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(saveAiSettings).toHaveBeenCalledTimes(1));
    expect(saveAiSettings).toHaveBeenCalledWith({
      provider: "openai",
      default_model: "gpt-4o-mini",
      api_key: "sk-test-123",
      ai_disabled: false,
    });
  });

  it("skips the AI settings save when 'Skip for now' is selected", async () => {
    const props = baseProps();
    const { container } = renderInRouter(<OnboardingFlow {...props} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    const skipTile = container.querySelector('[data-provider="skip"]');
    if (!skipTile) throw new Error("skip tile not found");
    fireEvent.click(skipTile);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    expect(props.saveAiSettings).not.toHaveBeenCalled();
  });

  it("surfaces the save error and stays on the AI step when saveAiSettings fails", async () => {
    const saveAiSettings = vi.fn(async () => ({
      ok: false as const,
      error: "encrypt failed",
    }));
    renderInRouter(
      <OnboardingFlow {...baseProps()} saveAiSettings={saveAiSettings} />,
    );
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByText(/encrypt failed/i)).toBeTruthy(),
    );
    // Still on the AI provider step.
    expect(
      screen.getByRole("heading", { name: /pick your ai provider/i }),
    ).toBeTruthy();
  });

  it("persists alert channels + threshold via saveAlerts when leaving step 4", async () => {
    const saveAlerts = vi.fn(async () => ({ ok: true as const }));
    renderInRouter(<OnboardingFlow {...baseProps()} saveAlerts={saveAlerts} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    // Default state: Slack on, Push off, 10 min.
    fireEvent.click(screen.getByRole("radio", { name: /^5 min$/i }));
    fireEvent.click(screen.getByRole("switch", { name: /toggle web push/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(saveAlerts).toHaveBeenCalledTimes(1));
    expect(saveAlerts).toHaveBeenCalledWith({
      alert_channels: ["slack_dm", "web_push"],
      notification_threshold_min: 5,
    });
  });

  it("persists an empty alert_channels array when both toggles are off", async () => {
    const saveAlerts = vi.fn(async () => ({ ok: true as const }));
    renderInRouter(<OnboardingFlow {...baseProps()} saveAlerts={saveAlerts} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    fireEvent.click(
      screen.getByRole("switch", { name: /toggle slack self-dm/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(saveAlerts).toHaveBeenCalledTimes(1));
    expect(saveAlerts).toHaveBeenCalledWith({
      alert_channels: [],
      notification_threshold_min: 10,
    });
  });

  it("surfaces the save error and stays on the Alerts step when saveAlerts fails", async () => {
    const saveAlerts = vi.fn(async () => ({
      ok: false as const,
      error: "preferences write failed",
    }));
    renderInRouter(<OnboardingFlow {...baseProps()} saveAlerts={saveAlerts} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(screen.getByText(/preferences write failed/i)).toBeTruthy(),
    );
    expect(
      screen.getByRole("heading", { name: /where should devy tap you/i }),
    ).toBeTruthy();
  });

  it("Open Devy on the final step calls complete + onFinish", async () => {
    const props = baseProps();
    renderInRouter(<OnboardingFlow {...props} />);
    await screen.findByRole("heading", { name: /welcome to your devy/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /connect your sources/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /pick your ai provider/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByRole("heading", { name: /where should devy tap you/i });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open devy/i }));
    await waitFor(() => expect(props.complete).toHaveBeenCalledTimes(1));
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("SlackAllowlistPanel", () => {
  it("loads existing channels and joins them with newlines into the textarea", async () => {
    const loader = vi.fn(async () => ({
      channels: ["C0001", "C0002"],
    }));
    render(<SlackAllowlistPanel loader={loader} />);
    const ta = (await screen.findByLabelText(
      /slack channel allowlist/i,
    )) as HTMLTextAreaElement;
    expect(ta.value).toBe("C0001\nC0002");
    expect(screen.getByText(/2 channels allowed/i)).toBeTruthy();
  });

  it("trims and dedupes lines on save", async () => {
    const loader = vi.fn(async () => ({ channels: [] as string[] }));
    const saver = vi.fn(async (channels: string[]) => ({ channels }));
    render(<SlackAllowlistPanel loader={loader} saver={saver} />);
    const ta = (await screen.findByLabelText(
      /slack channel allowlist/i,
    )) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "  C0001  \n\nC0002\n" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(saver).toHaveBeenCalledWith(["C0001", "C0002"]));
  });

  it("merges Slack-suggested channel IDs into the textarea without duplicating existing rows", async () => {
    const loader = vi.fn(async () => ({ channels: ["C0001"] }));
    const suggestionsLoader = vi.fn(async () => ({
      ok: true as const,
      channels: [
        { id: "C0001", name: "general", is_private: false },
        { id: "C0002", name: "leads", is_private: true },
      ],
    }));
    render(
      <SlackAllowlistPanel
        loader={loader}
        suggestionsLoader={suggestionsLoader}
      />,
    );
    const ta = (await screen.findByLabelText(
      /slack channel allowlist/i,
    )) as HTMLTextAreaElement;
    expect(ta.value).toBe("C0001");
    fireEvent.click(
      screen.getByRole("button", { name: /suggest from slack/i }),
    );
    await waitFor(() => expect(ta.value).toBe("C0001\nC0002"));
    expect(suggestionsLoader).toHaveBeenCalledOnce();
  });

  it("surfaces the error when Slack suggestions fail and leaves the textarea untouched", async () => {
    const loader = vi.fn(async () => ({ channels: ["C0001"] }));
    const suggestionsLoader = vi.fn(async () => ({
      ok: false as const,
      error: "slack not connected",
      needs_reauth: true,
    }));
    render(
      <SlackAllowlistPanel
        loader={loader}
        suggestionsLoader={suggestionsLoader}
      />,
    );
    const ta = (await screen.findByLabelText(
      /slack channel allowlist/i,
    )) as HTMLTextAreaElement;
    fireEvent.click(
      screen.getByRole("button", { name: /suggest from slack/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/slack not connected/i)).toBeTruthy(),
    );
    expect(ta.value).toBe("C0001");
  });
});
