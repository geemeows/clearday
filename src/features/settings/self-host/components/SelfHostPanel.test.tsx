import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SelfHostInfo } from "#/features/settings/self-host/api";
import { SelfHostPanel } from "#/features/settings/self-host/components/SelfHostPanel";

const FIXTURE: SelfHostInfo = {
  worker_url: "https://worker.example.com",
  supabase_url: "https://abc.supabase.co",
  auth_proxy_url: "https://auth.example.com",
  allowed_email: "owner@example.com",
  worker_version: "abc1234",
  env_vars: [],
  signal_count: 1847,
  rollup_count: 12,
  retention_days: 90,
};

describe("SelfHostPanel", () => {
  it("renders the metadata table with mono values for each row", async () => {
    render(<SelfHostPanel loader={async () => FIXTURE} />);
    expect(await screen.findByText("https://worker.example.com")).toBeTruthy();
    for (const label of [
      "Deployment URL",
      "Worker version",
      "Supabase project",
      "Allowed email",
      "Auth proxy URL",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("Copy button writes the row's value via the injected copy handler", async () => {
    const onCopy = vi.fn(async () => {});
    render(<SelfHostPanel loader={async () => FIXTURE} onCopy={onCopy} />);
    const button = await screen.findByRole("button", {
      name: /copy deployment url/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(onCopy).toHaveBeenCalledWith("https://worker.example.com"),
    );
  });

  it("renders Export my data and Run signal-rollup buttons", async () => {
    const onExportJson = vi.fn();
    const onRunRollup = vi.fn();
    render(
      <SelfHostPanel
        loader={async () => FIXTURE}
        onExportJson={onExportJson}
        onRunRollup={onRunRollup}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /export my data/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /run signal-rollup now/i }));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onRunRollup).toHaveBeenCalledTimes(1);
  });

  it("renders live stats string in the data section", async () => {
    render(<SelfHostPanel loader={async () => FIXTURE} />);
    expect(
      await screen.findByText("1,847 raw signals · 12 rollups · 90-day retention"),
    ).toBeTruthy();
  });

  it("renders the disconnect-all button with danger styling and fires the handler", async () => {
    const onDisconnectAll = vi.fn();
    render(
      <SelfHostPanel
        loader={async () => FIXTURE}
        onDisconnectAll={onDisconnectAll}
      />,
    );
    const button = await screen.findByRole("button", {
      name: /disconnect all providers/i,
    });
    expect(button.className).toContain("text-[var(--danger)]");
    fireEvent.click(button);
    expect(onDisconnectAll).toHaveBeenCalledTimes(1);
  });
});
