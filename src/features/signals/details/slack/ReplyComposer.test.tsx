import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlackReplyComposer } from "./ReplyComposer";

describe("SlackReplyComposer", () => {
  it("renders without crashing", () => {
    render(
      <SlackReplyComposer channel="C123" submit={async () => ({ ok: true })} />,
    );
    expect(screen.getByLabelText("Slack reply")).toBeTruthy();
    expect(screen.getByText("Send")).toBeTruthy();
  });

  it("disables Send when text is empty", () => {
    render(
      <SlackReplyComposer channel="C123" submit={async () => ({ ok: true })} />,
    );
    const send = screen.getByText("Send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("renders a 'From: @handle · workspace' indicator when an account is provided", () => {
    render(
      <SlackReplyComposer
        channel="C123"
        account={{ handle: "@kovacs.dev", workspace: "Acme" }}
        submit={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByLabelText("Sending account").textContent).toBe(
      "From: @kovacs.dev · Acme",
    );
  });

  it("omits the From indicator when no account is provided", () => {
    render(
      <SlackReplyComposer channel="C123" submit={async () => ({ ok: true })} />,
    );
    expect(screen.queryByLabelText("Sending account")).toBeNull();
  });
});
