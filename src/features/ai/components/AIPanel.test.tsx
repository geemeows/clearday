import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIPanel } from "#/features/ai/components/AIPanel";

describe("AIPanel", () => {
  it("renders four provider tiles", () => {
    render(<AIPanel />);
    for (const name of ["Anthropic", "OpenAI", "Google", "Groq"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name, "i") }),
      ).toBeTruthy();
    }
  });

  it("selects a provider tile on click and reflects aria-pressed", () => {
    render(<AIPanel />);
    const anthropic = screen.getByRole("button", { name: /anthropic/i });
    const openai = screen.getByRole("button", { name: /openai/i });
    expect(anthropic.getAttribute("aria-pressed")).toBe("true");
    expect(openai.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(openai);
    expect(openai.getAttribute("aria-pressed")).toBe("true");
    expect(anthropic.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders PRIMARY MODEL and FALLBACK MODEL selects", () => {
    render(<AIPanel />);
    expect(screen.getByRole("combobox", { name: /primary model/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /fallback model/i })).toBeTruthy();
  });

  it("switching provider resets primary to first model of that provider", () => {
    render(<AIPanel />);
    fireEvent.click(screen.getByRole("button", { name: /openai/i }));
    const primary = screen.getByRole("combobox", {
      name: /primary model/i,
    }) as unknown as HTMLSelectElement;
    expect(primary.value).toBe("gpt-4o");
  });

  it("renders the API key input as type=password", () => {
    render(<AIPanel />);
    const input = screen.getByLabelText("API key") as HTMLInputElement;
    expect(input.type).toBe("password");
  });

  it("Validate fires the injected validator and shows the success line on ok", async () => {
    const validator = vi.fn(async () => ({ ok: true }));
    render(<AIPanel validator={validator} />);
    const input = screen.getByLabelText("API key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-test-123" } });
    fireEvent.click(screen.getByRole("button", { name: /validate/i }));
    await waitFor(() => expect(validator).toHaveBeenCalledWith("sk-test-123"));
    expect(await screen.findByText(/last validated/i)).toBeTruthy();
  });

  it("renders the monthly budget section with spend and cap", () => {
    render(<AIPanel />);
    const section = screen.getByRole("region", { name: /monthly budget/i });
    expect(section).toBeTruthy();
    expect(section.textContent).toContain("$8.41");
    expect(section.textContent).toContain("of $25.00 cap");
  });

  it("renders the monthly cap input and fallback threshold select", () => {
    render(<AIPanel />);
    const capInput = screen.getByLabelText(/monthly cap/i) as HTMLInputElement;
    expect(capInput.type).toBe("number");
    expect(capInput.value).toBe("25");
    expect(screen.getByRole("combobox", { name: /fallback threshold/i })).toBeTruthy();
  });

  it("renders five privacy toggles and toggling one updates its checked state", () => {
    render(<AIPanel />);
    for (const label of [
      "Strip code blocks",
      "Strip file paths",
      "Strip secrets",
      "Strip PR diffs",
      "Disable AI on personal account",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeTruthy();
    }
    const toggle = screen.getByRole("switch", { name: "Strip file paths" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});
