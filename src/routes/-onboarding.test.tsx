import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingHero, SlackAllowlistPanel } from "#/routes/onboarding";

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
