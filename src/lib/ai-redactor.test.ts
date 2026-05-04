import { describe, expect, it } from "vitest";
import { PLACEHOLDER, redact, redactMessages } from "#/lib/ai-redactor";

describe("ai-redactor", () => {
  it("redacts fenced code blocks", () => {
    const input = "Look at this:\n```ts\nconst x = 1\n```\nokay?";
    const out = redact(input);
    expect(out).not.toContain("const x = 1");
    expect(out).toContain(PLACEHOLDER);
    expect(out).toContain("Look at this:");
    expect(out).toContain("okay?");
  });

  it("redacts sk-keys, GitHub tokens, and Bearer tokens", () => {
    const input = [
      "key=sk-abcdefghijklmnopqr",
      "gh: ghp_1234567890ABCDEFghij",
      "Authorization: Bearer abc.def.ghij_klmn",
    ].join("\n");
    const out = redact(input);
    expect(out).not.toContain("sk-abcdefghijklmnopqr");
    expect(out).not.toContain("ghp_1234567890ABCDEFghij");
    expect(out).not.toContain("abc.def.ghij_klmn");
    expect(out.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("redacts NAME=value env-style assignments with long values", () => {
    const out = redact("DATABASE_URL=postgres://user:pw@host/db");
    expect(out).not.toContain("postgres://user:pw@host/db");
    expect(out).toContain(PLACEHOLDER);
  });

  it("does not redact short fragments that resemble env assignments", () => {
    const out = redact("X=1");
    expect(out).toBe("X=1");
  });

  it("redacts unified-diff +/- lines when the buffer looks like a diff", () => {
    const input = [
      "diff --git a/foo.ts b/foo.ts",
      "@@ -1,2 +1,2 @@",
      "-old line of code",
      "+new line of code",
    ].join("\n");
    const out = redact(input);
    expect(out).not.toContain("old line of code");
    expect(out).not.toContain("new line of code");
  });

  it("does NOT redact +/- lines when the buffer is plain prose", () => {
    const out = redact("- a normal bullet line\n+ a follow up");
    expect(out).toContain("normal bullet line");
  });

  it("applies user-supplied custom patterns", () => {
    const out = redact("project=acme-prod-v17", ["acme-[a-z0-9-]+"]);
    expect(out).not.toContain("acme-prod-v17");
    expect(out).toContain(PLACEHOLDER);
  });

  it("ignores invalid user-supplied regex sources without throwing", () => {
    expect(() => redact("hello", ["[unclosed"])).not.toThrow();
  });

  it("redactMessages returns a fresh array and does not mutate the input", () => {
    const input = [
      { role: "user" as const, content: "leak=sk-abcdefghijklmnopqr" },
    ];
    const out = redactMessages(input);
    expect(input[0].content).toContain("sk-abcdefghijklmnopqr");
    expect(out[0].content).not.toContain("sk-abcdefghijklmnopqr");
  });

  it("does not redact when there's nothing sensitive", () => {
    const safe = "Summarize today's PRs in one paragraph.";
    expect(redact(safe)).toBe(safe);
  });
});
