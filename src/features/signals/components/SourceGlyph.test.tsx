import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SourceGlyph,
  type SourceKind,
} from "#/features/signals/components/SourceGlyph";

const CASES: Array<{ kind: SourceKind; label: string }> = [
  { kind: "git", label: "Git source" },
  { kind: "slack", label: "Slack source" },
  { kind: "cal", label: "Calendar source" },
  { kind: "task", label: "Task source" },
  { kind: "ai", label: "AI source" },
];

describe("SourceGlyph", () => {
  it.each(CASES)("renders the $kind variant with aria-label '$label'", ({
    kind,
    label,
  }) => {
    render(<SourceGlyph source={kind} />);
    const tile = screen.getByRole("img", { name: label });
    expect(tile.getAttribute("data-source")).toBe(kind);
  });

  it("respects the size prop", () => {
    render(<SourceGlyph source="git" size={40} />);
    const tile = screen.getByRole("img", { name: "Git source" });
    expect(tile.style.width).toBe("40px");
    expect(tile.style.height).toBe("40px");
  });
});
