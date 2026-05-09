import { describe, expect, it } from "vitest";
import { renderTemplate } from "#/features/automations/templating";
import type { Signal } from "#/shared/signal";

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    provider: "github",
    kind: "pr_authored",
    source_id: "pr-1",
    title: "feat: add knobs",
    url: "https://github.com/x/y/pull/1",
    payload: { author: "alice", repo: "x/y", merged: true },
    requires_action: true,
    source_created_at: "2026-05-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("renderTemplate", () => {
  it("substitutes signal.title", () => {
    expect(renderTemplate("{{signal.title}}", makeSignal())).toBe(
      "feat: add knobs",
    );
  });

  it("substitutes signal.payload.field", () => {
    expect(
      renderTemplate("by {{signal.payload.author}}", makeSignal()),
    ).toBe("by alice");
  });

  it("substitutes multiple tokens in one body", () => {
    expect(
      renderTemplate(
        "{{signal.title}} ({{signal.payload.repo}}): {{signal.url}}",
        makeSignal(),
      ),
    ).toBe(
      "feat: add knobs (x/y): https://github.com/x/y/pull/1",
    );
  });

  it("renders missing signal.payload.* fields as empty strings", () => {
    expect(renderTemplate("[{{signal.payload.missing}}]", makeSignal())).toBe(
      "[]",
    );
  });

  it("renders missing signal.* fields as empty strings", () => {
    // biome-ignore lint/suspicious/noExplicitAny: covering the runtime branch
    expect(renderTemplate("[{{signal.bogus}}]" as any, makeSignal())).toBe(
      "[]",
    );
  });

  it("renders null url as empty string", () => {
    expect(
      renderTemplate("{{signal.url}}", makeSignal({ url: null })),
    ).toBe("");
  });

  it("coerces non-string payload values via String()", () => {
    expect(renderTemplate("{{signal.payload.merged}}", makeSignal())).toBe(
      "true",
    );
  });

  it("supports nested payload paths", () => {
    expect(
      renderTemplate(
        "{{signal.payload.user.name}}",
        makeSignal({ payload: { user: { name: "alice" } } }),
      ),
    ).toBe("alice");
  });

  it("returns missing nested payload paths as empty", () => {
    expect(
      renderTemplate(
        "{{signal.payload.user.name}}",
        makeSignal({ payload: { user: null } }),
      ),
    ).toBe("");
  });

  it("leaves non-signal namespaces untouched", () => {
    // future tokens like {{schedule.*}} pass through; not the signal helper's job
    expect(
      renderTemplate("{{schedule.merged_prs_summary}}", makeSignal()),
    ).toBe("");
  });

  it("ignores tokens with no inner path", () => {
    expect(renderTemplate("{{signal}}", makeSignal())).toBe("");
  });

  it("returns the body unchanged when no tokens present", () => {
    expect(renderTemplate("plain text", makeSignal())).toBe("plain text");
  });

  it("tolerates whitespace around the path", () => {
    expect(
      renderTemplate("{{ signal.title }}", makeSignal()),
    ).toBe("feat: add knobs");
  });
});
