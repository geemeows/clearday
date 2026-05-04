import { describe, expect, it, vi } from "vitest";
import {
  type GithubFetch,
  GithubPollError,
  type GithubSearchItem,
  normalize,
  pollGithubSignals,
} from "#/lib/provider-adapter/github";

const baseItem: GithubSearchItem = {
  id: 1,
  number: 42,
  title: "Add cron orchestrator",
  html_url: "https://github.com/owner/repo/pull/42",
  state: "open",
  draft: false,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-02T11:00:00Z",
  repository_url: "https://api.github.com/repos/owner/repo",
  user: { login: "alice" },
  assignees: [{ login: "bob" }],
  requested_reviewers: [{ login: "me" }],
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe("normalize", () => {
  it("derives source_id from repo + PR number and sets requires_action by query intent", () => {
    const sig = normalize(baseItem, "pr_review_requested", true);
    expect(sig.provider).toBe("github");
    expect(sig.kind).toBe("pr_review_requested");
    expect(sig.source_id).toBe("owner/repo#42");
    expect(sig.url).toBe("https://github.com/owner/repo/pull/42");
    expect(sig.requires_action).toBe(true);
    expect(sig.title).toBe("Add cron orchestrator");
    expect(sig.payload).toMatchObject({
      repo: "owner/repo",
      number: 42,
      author: "alice",
      draft: false,
      assignees: ["bob"],
      requested_reviewers: ["me"],
    });
  });

  it("clears requires_action when the PR is a draft, even if query says action required", () => {
    const sig = normalize(
      { ...baseItem, draft: true },
      "pr_review_requested",
      true,
    );
    expect(sig.requires_action).toBe(false);
    expect(sig.payload.draft).toBe(true);
  });

  it("does not require action for authored PRs", () => {
    const sig = normalize(baseItem, "pr_authored", false);
    expect(sig.requires_action).toBe(false);
  });
});

describe("pollGithubSignals", () => {
  it("issues the three search queries and returns deduped Signals", async () => {
    const calls: string[] = [];
    const fetchImpl: GithubFetch = vi.fn(async (url, init) => {
      calls.push(url);
      // Same PR appears under both authored and assigned; only the first
      // (review-requested) returns it, so dedup keeps that kind.
      const params = new URL(url).searchParams.get("q") ?? "";
      expect(init.headers.authorization).toBe("Bearer tok");
      if (params.includes("review-requested:@me")) {
        return okJson({ items: [baseItem] });
      }
      if (params.includes("author:@me")) {
        return okJson({
          items: [
            {
              ...baseItem,
              number: 99,
              repository_url: baseItem.repository_url,
            },
          ],
        });
      }
      // assignee – return baseItem to test dedup
      return okJson({ items: [baseItem] });
    });
    const signals = await pollGithubSignals("tok", fetchImpl);
    expect(calls).toHaveLength(3);
    expect(signals).toHaveLength(2);
    const kinds = signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(["pr_authored", "pr_review_requested"]);
    const sourceIds = signals.map((s) => s.source_id).sort();
    expect(sourceIds).toEqual(["owner/repo#42", "owner/repo#99"]);
  });

  it("throws GithubPollError on non-2xx", async () => {
    const fetchImpl: GithubFetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => "rate limited",
    });
    await expect(pollGithubSignals("tok", fetchImpl)).rejects.toBeInstanceOf(
      GithubPollError,
    );
  });
});
