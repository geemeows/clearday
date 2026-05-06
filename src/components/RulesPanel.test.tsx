import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RulesPanel } from "#/components/RulesPanel";

describe("RulesPanel", () => {
  it("renders the default rules with WHEN/THEN chips, hits, Edit, Switch", () => {
    render(<RulesPanel />);
    const list = screen.getByLabelText("Inbox rules");
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(3);

    const dependabot = within(list).getByLabelText("Skip Dependabot PRs rule");
    expect(within(dependabot).getByText(/author is dependabot/)).toBeTruthy();
    expect(within(dependabot).getByText("Skip inbox")).toBeTruthy();
    expect(within(dependabot).getByText(/142 hits \/ 30d/)).toBeTruthy();
    expect(
      within(dependabot).getByRole("button", { name: /edit skip dependabot/i }),
    ).toBeTruthy();
    expect(
      within(dependabot).getByLabelText("Skip Dependabot PRs enabled"),
    ).toBeTruthy();
  });

  it("toggling a rule's switch flips aria-checked", () => {
    render(<RulesPanel />);
    const toggle = screen.getByLabelText("Skip Dependabot PRs enabled");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("'+ New rule' opens the inline RuleBuilder card", () => {
    render(<RulesPanel />);
    expect(screen.queryByLabelText("Rule builder")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
    expect(screen.getByLabelText("Rule builder")).toBeTruthy();
  });

  it("Cancel inside the builder closes it", () => {
    render(<RulesPanel />);
    fireEvent.click(screen.getByRole("button", { name: /new rule/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText("Rule builder")).toBeNull();
  });
});
