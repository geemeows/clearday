import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlackThreadContext } from "./ThreadContext";

describe("SlackThreadContext", () => {
  it("renders without crashing while loading", () => {
    const load = () => new Promise<never>(() => {});
    render(<SlackThreadContext channel="C1" thread_ts="100" load={load} />);
    expect(screen.getByText(/Loading thread/)).toBeTruthy();
  });

  it("renders messages once loaded", async () => {
    const load = async () => ({
      ok: true as const,
      messages: [
        {
          ts: "100",
          user_id: "U1",
          user_name: "Alice",
          text: "hello",
          is_self: false,
        },
      ],
    });
    render(<SlackThreadContext channel="C1" thread_ts="100" load={load} />);
    await waitFor(() => {
      expect(screen.getByText("hello")).toBeTruthy();
    });
    expect(screen.getByText("Alice")).toBeTruthy();
  });
});
