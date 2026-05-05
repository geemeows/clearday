import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  OnboardingWizard,
  ProvidersStep,
  SlackAllowlistPanel,
} from "#/routes/onboarding";

describe("OnboardingWizard", () => {
  it("walks Continue across all 5 steps and finishes by completing", async () => {
    const complete = vi.fn(async () => ({ ok: true as const }));
    const onFinish = vi.fn();
    render(<OnboardingWizard onFinish={onFinish} complete={complete} />);

    // step 1 visible
    expect(
      screen.getByRole("region", { name: /Step 1: Connect providers/i }),
    ).toBeTruthy();

    const continueBtn = () =>
      screen.getByRole("button", {
        name: /^(continue|finish)$/i,
      });

    fireEvent.click(continueBtn()); // -> step 2 channels
    expect(
      await screen.findByRole("region", { name: /Step 2: Alert channels/i }),
    ).toBeTruthy();

    fireEvent.click(continueBtn()); // -> step 3 quiet
    expect(
      await screen.findByRole("region", { name: /Step 3: Quiet hours/i }),
    ).toBeTruthy();

    fireEvent.click(continueBtn()); // -> step 4 ai
    expect(
      await screen.findByRole("region", { name: /Step 4: AI provider/i }),
    ).toBeTruthy();

    fireEvent.click(continueBtn()); // -> step 5 slack-allowlist
    expect(
      await screen.findByRole("region", {
        name: /Step 5: Slack channels/i,
      }),
    ).toBeTruthy();

    // Finish
    fireEvent.click(screen.getByRole("button", { name: /^finish$/i }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("Back button moves to the previous step and disables on step 1", async () => {
    render(
      <OnboardingWizard
        onFinish={() => {}}
        complete={async () => ({ ok: true as const })}
      />,
    );
    const back = screen.getByRole("button", { name: /^back$/i });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(
      await screen.findByRole("region", { name: /Step 2: Alert channels/i }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(
      await screen.findByRole("region", { name: /Step 1: Connect providers/i }),
    ).toBeTruthy();
  });

  it("Skip advances without persisting any step-specific state", async () => {
    const complete = vi.fn(async () => ({ ok: true as const }));
    render(<OnboardingWizard onFinish={() => {}} complete={complete} />);
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(
      await screen.findByRole("region", { name: /Step 2: Alert channels/i }),
    ).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("ProvidersStep", () => {
  it("renders one row per known provider with status dots from /api/sources", async () => {
    const loader = vi.fn(async () => ({
      sources: [
        { provider: "github", status: "connected" as const },
        { provider: "slack", status: "disconnected" as const },
      ],
    }));
    render(<ProvidersStep loader={loader} />);
    expect(await screen.findByText("GitHub")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText("Linear")).toBeTruthy();

    const githubDot = screen.getByLabelText(/GitHub connected/i);
    expect(githubDot.getAttribute("data-status")).toBe("ok");
    const slackDot = screen.getByLabelText(/Slack not connected/i);
    expect(slackDot.getAttribute("data-status")).toBe("neutral");
  });

  it("Connect button forwards through connect-url API and opens the URL", async () => {
    const loader = vi.fn(async () => ({ sources: [] as never[] }));
    const connectUrl = vi.fn(async () => ({
      ok: true,
      url: "https://auth.example.com/start/github",
    }));
    const openUrl = vi.fn();
    render(
      <ProvidersStep
        loader={loader}
        connectUrl={connectUrl}
        openUrl={openUrl}
      />,
    );
    const button = (
      await screen.findAllByRole("button", { name: /^connect$/i })
    )[0];
    fireEvent.click(button);
    await waitFor(() => expect(connectUrl).toHaveBeenCalled());
    expect(openUrl).toHaveBeenCalledWith(
      "https://auth.example.com/start/github",
    );
  });

  it("shows an error if connect-url fails", async () => {
    const loader = vi.fn(async () => ({ sources: [] as never[] }));
    const connectUrl = vi.fn(async () => ({
      ok: false,
      error: "auth-proxy not configured",
    }));
    render(
      <ProvidersStep
        loader={loader}
        connectUrl={connectUrl}
        openUrl={() => {}}
      />,
    );
    const button = (
      await screen.findAllByRole("button", { name: /^connect$/i })
    )[0];
    fireEvent.click(button);
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
