import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsPanel } from "#/components/ui/SettingsPanel";

describe("SettingsPanel", () => {
  it("renders title as an h2 and desc as a paragraph", () => {
    render(<SettingsPanel title="Notifications" desc="Where alerts go." />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe("Notifications");
    expect(screen.getByText("Where alerts go.")).toBeTruthy();
  });

  it("uses the title as the section's aria-label", () => {
    render(<SettingsPanel title="Push devices" desc="Manage devices." />);
    expect(screen.getByLabelText("Push devices")).toBeTruthy();
  });

  it("renders children", () => {
    render(
      <SettingsPanel title="t" desc="d">
        <span>field-here</span>
      </SettingsPanel>,
    );
    expect(screen.getByText("field-here")).toBeTruthy();
  });

  it("does not render an error block when error is null", () => {
    render(<SettingsPanel title="t" desc="d" error={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a role=alert block when error is set", () => {
    render(<SettingsPanel title="t" desc="d" error="boom" />);
    expect(screen.getByRole("alert").textContent).toBe("boom");
  });

  it("renders a Loading… placeholder when busy is true", () => {
    render(<SettingsPanel title="t" desc="d" busy={true} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("does not render the Loading… placeholder when busy is false", () => {
    render(<SettingsPanel title="t" desc="d" busy={false} />);
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("forwards className", () => {
    const { container } = render(
      <SettingsPanel title="t" desc="d" className="extra" />,
    );
    const el = container.querySelector(
      '[data-slot="settings-panel"]',
    ) as HTMLElement;
    expect(el.className).toMatch(/extra/);
  });
});
