// Tiptap doc → Slack mrkdwn serializer. Pure function; no React, no browser.
//
// Tiptap document schema (starter-kit subset used in the Slack reply composer):
//   doc → paragraph* → text (with optional marks: bold, italic, code, link)
//          | bulletList → listItem → paragraph → text
//          | orderedList → listItem → paragraph → text
//
// Slack mrkdwn reference: https://api.slack.com/reference/surfaces/formatting

export type TiptapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type TiptapNode = {
  type: string;
  text?: string;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
};

export type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
};

/**
 * Serialize a tiptap document to Slack mrkdwn text.
 * Block-level nodes are joined with newlines; inline marks wrap their text.
 */
export function serializeToSlack(doc: TiptapDoc): string {
  if (!doc.content || doc.content.length === 0) return "";
  return doc.content
    .map((node) => serializeBlock(node))
    .filter((s) => s !== null)
    .join("\n")
    .trim();
}

function serializeBlock(node: TiptapNode): string | null {
  switch (node.type) {
    case "paragraph": {
      const text = serializeInlines(node.content ?? []);
      return text;
    }
    case "bulletList": {
      return (node.content ?? [])
        .map((item) => {
          const inner = (item.content ?? [])
            .map((p) => serializeInlines(p.content ?? []))
            .join("");
          return `• ${inner}`;
        })
        .join("\n");
    }
    case "orderedList": {
      return (node.content ?? [])
        .map((item, i) => {
          const inner = (item.content ?? [])
            .map((p) => serializeInlines(p.content ?? []))
            .join("");
          return `${i + 1}. ${inner}`;
        })
        .join("\n");
    }
    case "codeBlock": {
      const text = serializeInlines(node.content ?? []);
      return `\`\`\`\n${text}\n\`\`\``;
    }
    case "blockquote": {
      const inner = (node.content ?? [])
        .map((p) => serializeInlines(p.content ?? []))
        .join("\n");
      return `> ${inner}`;
    }
    case "hardBreak":
      return "\n";
    default:
      return null;
  }
}

function serializeInlines(nodes: TiptapNode[]): string {
  return nodes.map((node) => serializeInline(node)).join("");
}

function serializeInline(node: TiptapNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text") return "";
  const text = node.text ?? "";
  if (!node.marks || node.marks.length === 0) return text;

  // Apply marks inside-out. Slack doesn't support nested formatting perfectly,
  // but wrapping in order gives the best interop.
  return node.marks.reduce<string>((acc, mark) => {
    switch (mark.type) {
      case "bold":
        return `*${acc}*`;
      case "italic":
        return `_${acc}_`;
      case "code":
        return `\`${acc}\``;
      case "link": {
        const href = (mark.attrs?.href as string | undefined) ?? "";
        return href ? `<${href}|${acc}>` : acc;
      }
      default:
        return acc;
    }
  }, text);
}
