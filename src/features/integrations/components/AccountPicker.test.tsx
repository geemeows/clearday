import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountPicker, type AccountPickerOption } from "./AccountPicker";

function opt(
  o: Partial<AccountPickerOption> & { id: string },
): AccountPickerOption {
  return {
    id: o.id,
    handle: o.handle ?? o.id,
    display_name: o.display_name,
    context: o.context,
    primary: o.primary,
    status: o.status ?? "ok",
  };
}

describe("AccountPicker", () => {
  it("renders nothing for single-account providers", () => {
    const { container } = render(
      <AccountPicker
        providerId="github"
        accounts={[opt({ id: "gh-1", primary: true })]}
        value="gh-1"
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for zero-account providers", () => {
    const { container } = render(
      <AccountPicker
        providerId="github"
        accounts={[]}
        value=""
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a status dot for the selected account", () => {
    render(
      <AccountPicker
        providerId="github"
        accounts={[
          opt({ id: "gh-1", primary: true, status: "ok" }),
          opt({ id: "gh-2", status: "auth_failed" }),
        ]}
        value="gh-2"
        onChange={() => {}}
      />,
    );
    const dot = document.querySelector('[data-account-status="auth_failed"]');
    expect(dot).not.toBeNull();
  });

  it("calls onChange with the selected account id", () => {
    const onChange = vi.fn();
    render(
      <AccountPicker
        providerId="slack"
        accounts={[
          opt({ id: "slack-a", primary: true }),
          opt({ id: "slack-b" }),
        ]}
        value="slack-a"
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("slack account");
    fireEvent.change(select, { target: { value: "slack-b" } });
    expect(onChange).toHaveBeenCalledWith("slack-b");
  });

  it("surfaces an inline Reauthorize affordance when the current selection is unhealthy", () => {
    const onReauthorize = vi.fn();
    render(
      <AccountPicker
        providerId="slack"
        accounts={[
          opt({ id: "slack-a", primary: true, status: "auth_failed" }),
          opt({ id: "slack-b", status: "ok" }),
        ]}
        value="slack-a"
        onReauthorize={onReauthorize}
        onChange={() => {}}
      />,
    );
    const reauth = screen.getByText("Reauthorize");
    fireEvent.click(reauth);
    expect(onReauthorize).toHaveBeenCalledWith("slack-a");
  });

  it("does not render the Reauthorize affordance for healthy selections", () => {
    render(
      <AccountPicker
        providerId="slack"
        accounts={[
          opt({ id: "slack-a", primary: true, status: "ok" }),
          opt({ id: "slack-b", status: "ok" }),
        ]}
        value="slack-a"
        onReauthorize={() => {}}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("Reauthorize")).toBeNull();
  });

  it("renders option labels with handle, context and a primary tag", () => {
    render(
      <AccountPicker
        providerId="github"
        accounts={[
          opt({
            id: "gh-1",
            handle: "@personal",
            context: "14 repos",
            primary: true,
          }),
          opt({ id: "gh-2", handle: "@work", context: "acme" }),
        ]}
        value="gh-1"
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("option", { name: "@personal · 14 repos (primary)" }),
    ).toBeTruthy();
    expect(screen.getByRole("option", { name: "@work · acme" })).toBeTruthy();
  });
});
