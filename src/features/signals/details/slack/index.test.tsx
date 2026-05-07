import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoredSignal } from "#/features/signals/components/InboxView";
import { SlackDetail } from "./index";

const slackSignal: StoredSignal = {
  id: "s1",
  provider: "slack",
  kind: "dm",
  source_id: "C123:1700000000.000100",
  title: "Question about migration",
  url: null,
  payload: {
    channel: "C123",
    channel_name: "engineering",
    channel_type: "channel",
    author: "U1",
    author_name: "Alice",
    text: "ping",
    ts: "1700000000.000100",
  },
  requires_action: false,
  source_created_at: "2026-05-04T15:00:00Z",
  dismissed_at: null,
};

describe("SlackDetail", () => {
  it("renders without crashing for a representative slack signal", () => {
    render(<SlackDetail signal={slackSignal} />);
    expect(screen.getByText("#engineering")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("ping")).toBeTruthy();
  });

  it("renders 'Direct message' for IM channel type", () => {
    const dm: StoredSignal = {
      ...slackSignal,
      payload: { ...slackSignal.payload, channel_type: "im" },
    };
    render(<SlackDetail signal={dm} />);
    expect(screen.getByText("Direct message")).toBeTruthy();
  });
});
