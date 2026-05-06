import { describe, expect, it } from "vitest";
import {
  providerOpenLabel,
  providerSourceKind,
  signalKindLabel,
} from "#/features/integrations/display";

describe("providerSourceKind", () => {
  it("maps each known provider to its glyph kind", () => {
    expect(providerSourceKind("github")).toBe("git");
    expect(providerSourceKind("slack")).toBe("slack");
    expect(providerSourceKind("google")).toBe("cal");
    expect(providerSourceKind("linear")).toBe("task");
    expect(providerSourceKind("jira")).toBe("task");
  });
});

describe("providerOpenLabel", () => {
  it("returns provider-specific open labels", () => {
    expect(providerOpenLabel("github")).toBe("Open in GitHub");
    expect(providerOpenLabel("slack")).toBe("Open in Slack");
    expect(providerOpenLabel("linear")).toBe("Open in Linear");
    expect(providerOpenLabel("jira")).toBe("Open in Jira");
    expect(providerOpenLabel("google")).toBe("Open in Calendar");
  });
});

describe("signalKindLabel", () => {
  it("returns human labels for known kinds", () => {
    expect(signalKindLabel("pr_review_requested")).toBe("Review requested");
    expect(signalKindLabel("pr_authored")).toBe("Authored PR");
    expect(signalKindLabel("pr_assigned")).toBe("Assigned PR");
    expect(signalKindLabel("meeting")).toBe("Meeting");
    expect(signalKindLabel("dm")).toBe("Direct message");
    expect(signalKindLabel("mention")).toBe("Mention");
    expect(signalKindLabel("thread_reply")).toBe("Thread reply");
    expect(signalKindLabel("ticket_assigned")).toBe("Todo");
    expect(signalKindLabel("ticket_in_progress")).toBe("In progress");
    expect(signalKindLabel("ticket_in_review")).toBe("In review");
    expect(signalKindLabel("ticket_blocked")).toBe("Blocked");
  });

  it("falls back to the raw kind for unknown values", () => {
    expect(signalKindLabel("something_new")).toBe("something_new");
  });
});
