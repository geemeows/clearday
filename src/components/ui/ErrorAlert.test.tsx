import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorAlert } from "#/components/ui/ErrorAlert";

describe("ErrorAlert", () => {
  it("returns null when error is null", () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when error is undefined", () => {
    const { container } = render(<ErrorAlert error={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a string error with role=alert", () => {
    render(<ErrorAlert error="boom" />);
    const el = screen.getByRole("alert");
    expect(el.textContent).toBe("boom");
  });

  it("renders an Error instance using its message", () => {
    render(<ErrorAlert error={new Error("kaboom")} />);
    expect(screen.getByRole("alert").textContent).toBe("kaboom");
  });

  it("forwards className", () => {
    render(<ErrorAlert error="x" className="extra" />);
    expect(screen.getByRole("alert").className).toMatch(/extra/);
  });
});
