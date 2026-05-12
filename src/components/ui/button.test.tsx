import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "#/components/ui/button";

describe("coss Button", () => {
  it("renders children inside a native button", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("data-slot")).toBe("button");
  });

  it("forwards onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: /go/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables and stops emitting onClick when loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    );
    const btn = screen.getByRole("button", {
      name: /submit/i,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("applies variant + size token-driven classes", () => {
    render(
      <Button variant="outline" size="sm">
        Outline
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /outline/i });
    expect(btn.className).toMatch(/bg-popover|text-foreground/);
    expect(btn.className).toMatch(/h-8|sm:h-7/);
  });
});
