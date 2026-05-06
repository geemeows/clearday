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

  it("renders Export JSON and Run rollup as no-op stubs", async () => {
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
      await screen.findByRole("button", { name: /export json/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /run rollup/i }));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onRunRollup).toHaveBeenCalledTimes(1);
  });

  it("renders the disconnect-all button in the destructive variant", async () => {
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
    expect(button.getAttribute("data-variant")).toBe("destructive");
    fireEvent.click(button);
    expect(onDisconnectAll).toHaveBeenCalledTimes(1);
  });
});
