import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RuleBuilder } from "#/components/RuleBuilder";

describe("RuleBuilder", () => {
  it("starts with one condition row and supports add/remove", () => {
    render(<RuleBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    const conds = screen.getByLabelText("Conditions");
    expect(within(conds).getAllByRole("listitem").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    expect(within(conds).getAllByRole("listitem").length).toBe(2);

    fireEvent.click(screen.getByLabelText("Remove condition 2"));
    expect(within(conds).getAllByRole("listitem").length).toBe(1);

    // The last remove is disabled — clicking again must keep one row.
    const remaining = screen.getByLabelText(
      "Remove condition 1",
    ) as HTMLButtonElement;
    expect(remaining.disabled).toBe(true);
    fireEvent.click(remaining);
    expect(within(conds).getAllByRole("listitem").length).toBe(1);
  });

  it("changing a condition's field resets op and value to first option", () => {
    render(<RuleBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    const opSelect = screen.getByLabelText(
      "Condition 1 operator",
    ) as unknown as HTMLSelectElement;
    const valueSelect = screen.getByLabelText(
      "Condition 1 value",
    ) as unknown as HTMLSelectElement;

    // Move the op + value off the defaults.
    fireEvent.change(opSelect, { target: { value: "is_not" } });
    fireEvent.change(valueSelect, { target: { value: "slack" } });
    expect(opSelect.value).toBe("is_not");
    expect(valueSelect.value).toBe("slack");

    // Switching field resets op + value to that field's first option.
    fireEvent.change(screen.getByLabelText("Condition 1 field"), {
      target: { value: "kind" },
    });
    expect(
      (
        screen.getByLabelText(
          "Condition 1 operator",
        ) as unknown as HTMLSelectElement
      ).value,
    ).toBe("is");
    expect(
      (
        screen.getByLabelText(
          "Condition 1 value",
        ) as unknown as HTMLSelectElement
      ).value,
    ).toBe("pr_review");
  });

  it("shows the param input only for actions that take a param", () => {
    render(<RuleBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    // Default action is "skip_inbox" — no param.
    expect(screen.queryByLabelText("Action parameter")).toBeNull();

    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "label" },
    });
    expect(screen.getByLabelText("Action parameter")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "mark_read" },
    });
    expect(screen.queryByLabelText("Action parameter")).toBeNull();
  });

  it("Save fires onSave with the canonical rule shape", () => {
    const onSave = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Condition 1 field"), {
      target: { value: "author" },
    });
    fireEvent.change(screen.getByLabelText("Condition 1 value"), {
      target: { value: "dependabot" },
    });
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "label" },
    });
    fireEvent.change(screen.getByLabelText("Action parameter"), {
      target: { value: "deps" },
    });
    fireEvent.change(screen.getByLabelText("Rule name"), {
      target: { value: "Tag dependabot" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save rule/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({
      matchAll: true,
      conds: [{ field: "author", op: "is", value: "dependabot" }],
      action: "label",
      actionParam: "deps",
      name: "Tag dependabot",
    });
  });

  it("Save omits actionParam when the action takes no param", () => {
    const onSave = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /save rule/i }));
    expect(onSave.mock.calls[0][0].actionParam).toBeUndefined();
  });

  it("match all/any toggle flips the matchAll state passed to onSave", () => {
    const onSave = vi.fn();
    render(<RuleBuilder onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Match any" }));
    fireEvent.click(screen.getByRole("button", { name: /save rule/i }));
    expect(onSave.mock.calls[0][0].matchAll).toBe(false);
  });

  it("Cancel fires onCancel", () => {
    const onCancel = vi.fn();
    render(<RuleBuilder onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
