// Markdown → safe HTML renderer. Configured once and shared by the GH PR
// description and PR comments. GFM (tables, strikethrough, task-lists) is
// on; unsafe HTML in the source is stripped via DOMPurify.

import { marked } from "marked";
import DOMPurify from "dompurify";

marked.use({ gfm: true, breaks: false });

/**
 * Render a markdown string to a sanitized HTML string.
 * Safe to set as `dangerouslySetInnerHTML` — DOMPurify strips all unsafe
 * elements and event attributes.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || source.trim().length === 0) return "";
  const raw = marked.parse(source) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    // Allow anchors to open in a new tab but strip javascript: hrefs.
    ADD_ATTR: ["target", "rel"],
  });
}
