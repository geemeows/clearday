import { fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichEditor } from "./RichEditor";

// Helper: render the editor and grab the underlying TipTap editor instance.
function renderEditor(
  props: Partial<React.ComponentProps<typeof RichEditor>> = {},
) {
  let ed: Editor | null = null;
  const utils = render(
    <RichEditor
      {...props}
      onReady={(e) => {
        ed = e;
      }}
    />,
  );
  // useEditor mounts the editor synchronously inside an effect.
  if (!ed) throw new Error("editor did not mount");
  return { ...utils, editor: ed as Editor };
}

describe("RichEditor", () => {
  it("renders the toolbar with the expected buttons", () => {
    renderEditor();
    for (const label of [
      "Bold",
      "Italic",
      "Strikethrough",
      "Heading",
      "Bullet list",
      "Numbered list",
      "Quote",
      "Inline code",
      "Code block",
      "Link",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("renders placeholder text on the empty paragraph", () => {
    renderEditor({ placeholder: "Type something…" });
    const empty = document.querySelector(
      ".ProseMirror p.is-editor-empty",
    ) as HTMLElement | null;
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute("data-placeholder")).toBe("Type something…");
  });

  it("toggles the bold mark when the Bold button is clicked", () => {
    const onChange = vi.fn();
    const { editor } = renderEditor({
      value: "<p>hello world</p>",
      onChange,
    });
    editor.commands.selectAll();
    expect(editor.isActive("bold")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(editor.isActive("bold")).toBe(true);
    expect(editor.getHTML()).toContain("<strong>");
    expect(onChange).toHaveBeenCalled();
  });

  it("toggles the italic mark when the Italic button is clicked", () => {
    const { editor } = renderEditor({ value: "<p>hello</p>" });
    editor.commands.selectAll();
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(editor.isActive("italic")).toBe(true);
    expect(editor.getHTML()).toContain("<em>");
  });

  describe("Link extension", () => {
    beforeEach(() => {
      vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("inserts an anchor when a URL is supplied via the Link prompt", () => {
      const { editor } = renderEditor({ value: "<p>visit here</p>" });
      editor.commands.selectAll();
      fireEvent.click(screen.getByRole("button", { name: "Link" }));
      const html = editor.getHTML();
      expect(html).toContain('href="https://example.com"');
      expect(editor.isActive("link")).toBe(true);
    });

    it("clears the link when Link is clicked again with an active link", () => {
      const { editor } = renderEditor({
        value: '<p><a href="https://example.com">visit</a></p>',
      });
      editor.commands.selectAll();
      expect(editor.isActive("link")).toBe(true);
      // when a link is active, clicking unsets it (no prompt)
      vi.spyOn(window, "prompt").mockReturnValue(null);
      fireEvent.click(screen.getByRole("button", { name: "Link" }));
      expect(editor.isActive("link")).toBe(false);
      expect(editor.getHTML()).not.toContain("<a ");
    });
  });

  it("syncs external value changes into the editor", () => {
    const { rerender, editor } = renderEditor({ value: "<p>one</p>" });
    expect(editor.getHTML()).toContain("one");
    rerender(<RichEditor value="<p>two</p>" />);
    expect(editor.getHTML()).toContain("two");
  });
});
