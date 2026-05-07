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
});
