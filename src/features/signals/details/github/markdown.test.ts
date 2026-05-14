// Tests for the markdown renderer: sanitization, code-fence rendering, links.

import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown — basic rendering", () => {
  it("renders plain text wrapped in a paragraph", () => {
    const out = renderMarkdown("hello world");
    expect(out).toContain("hello world");
    expect(out).toContain("<p>");
  });

  it("returns empty string for null input", () => {
    expect(renderMarkdown(null)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(renderMarkdown("   ")).toBe("");
  });
});

describe("renderMarkdown — sanitization", () => {
  it("strips <script> tags", () => {
    const out = renderMarkdown('<script>alert("xss")</script>text');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips inline event attributes (onerror)", () => {
    const out = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("strips javascript: hrefs", () => {
    // biome-ignore lint/style/useTemplate: deliberately using concat for xss pattern
    const out = renderMarkdown("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
  });

  it("preserves safe anchor tags", () => {
    const out = renderMarkdown("[example](https://example.com)");
    expect(out).toContain("https://example.com");
    expect(out).toContain("<a");
  });
});

describe("renderMarkdown — code fences", () => {
  it("wraps fenced code in <pre><code>", () => {
    const out = renderMarkdown("```\nconst x = 1;\n```");
    expect(out).toContain("<pre>");
    expect(out).toContain("<code");
    expect(out).toContain("const x = 1;");
  });

  it("preserves inline code marks", () => {
    const out = renderMarkdown("Call `fn()` here.");
    expect(out).toContain("<code>fn()</code>");
  });
});

describe("renderMarkdown — GFM features", () => {
  it("renders a GFM table", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const out = renderMarkdown(md);
    expect(out).toContain("<table");
    expect(out).toContain("<td");
  });

  it("renders strikethrough", () => {
    const out = renderMarkdown("~~deleted~~");
    expect(out).toContain("<del");
  });
});
