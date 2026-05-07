import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AIPanel } from "#/features/ai/components/AIPanel";

describe("AIPanel", () => {
  it("renders the five provider tiles with model names in mono", () => {
    render(<AIPanel />);
    for (const name of [
      "Anthropic",
      "OpenAI",
      "Google",
      "Groq",
      "Local Ollama",
    ]) {
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

  it("renders the monthly budget card", () => {
    render(<AIPanel />);
    expect(screen.getByLabelText("Monthly budget")).toBeTruthy();
  });
});
