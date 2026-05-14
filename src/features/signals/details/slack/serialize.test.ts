// Tests for tiptap doc → Slack mrkdwn serializer.

import { describe, expect, it } from "vitest";
import { serializeToSlack, type TiptapDoc } from "./serialize";

function doc(...blocks: object[]): TiptapDoc {
  return { type: "doc", content: blocks as TiptapDoc["content"] };
}

function para(...nodes: object[]) {
  return { type: "paragraph", content: nodes };
}

function text(s: string, ...marks: object[]) {
  return marks.length > 0
    ? { type: "text", text: s, marks }
    : { type: "text", text: s };
}

const bold = { type: "bold" };
const italic = { type: "italic" };
const code = { type: "code" };
function link(href: string) {
  return { type: "link", attrs: { href } };
}

describe("serializeToSlack — plain text", () => {
  it("serializes a simple paragraph", () => {
    expect(serializeToSlack(doc(para(text("hello world"))))).toBe(
      "hello world",
    );
  });

  it("returns empty string for empty doc", () => {
    expect(serializeToSlack({ type: "doc" })).toBe("");
  });

  it("joins multiple paragraphs with newlines", () => {
    const out = serializeToSlack(
      doc(para(text("line one")), para(text("line two"))),
    );
    expect(out).toBe("line one\nline two");
  });
});

describe("serializeToSlack — inline marks", () => {
  it("wraps bold text in asterisks", () => {
    expect(serializeToSlack(doc(para(text("hello", bold))))).toBe("*hello*");
  });

  it("wraps italic text in underscores", () => {
    expect(serializeToSlack(doc(para(text("hi", italic))))).toBe("_hi_");
  });

  it("wraps code in backticks", () => {
    expect(serializeToSlack(doc(para(text("fn()", code))))).toBe("`fn()`");
  });

  it("renders link as <url|text>", () => {
    expect(
      serializeToSlack(
        doc(para(text("click here", link("https://example.com")))),
      ),
    ).toBe("<https://example.com|click here>");
  });

  it("renders link text without href as plain text", () => {
    expect(
      serializeToSlack(
        doc(para(text("no-href", { type: "link", attrs: {} }))),
      ),
    ).toBe("no-href");
  });
});

describe("serializeToSlack — lists", () => {
  it("renders bullet list with bullet points", () => {
    const out = serializeToSlack(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [para(text("item one"))] },
          { type: "listItem", content: [para(text("item two"))] },
        ],
      }),
    );
    expect(out).toBe("• item one\n• item two");
  });

  it("renders ordered list with numbers", () => {
    const out = serializeToSlack(
      doc({
        type: "orderedList",
        content: [
          { type: "listItem", content: [para(text("first"))] },
          { type: "listItem", content: [para(text("second"))] },
        ],
      }),
    );
    expect(out).toBe("1. first\n2. second");
  });
});

describe("serializeToSlack — code block", () => {
  it("wraps code block in triple backticks", () => {
    const out = serializeToSlack(
      doc({ type: "codeBlock", content: [text("const x = 1;")] }),
    );
    expect(out).toBe("```\nconst x = 1;\n```");
  });
});

describe("serializeToSlack — unknown mark types", () => {
  it("passes through text with unknown marks unchanged", () => {
    expect(
      serializeToSlack(
        doc(para(text("plain", { type: "unknownMark" }))),
      ),
    ).toBe("plain");
  });
});
