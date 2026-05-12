import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import "./rich-editor.css";

export type RichEditorProps = {
  value?: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  flat?: boolean;
  className?: string;
  ariaLabel?: string;
  onReady?: (editor: Editor) => void;
};

type ToolbarBtnProps = {
  icon: ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolbarBtn({
  icon,
  title,
  active,
  disabled,
  onClick,
}: ToolbarBtnProps) {
  return (
    <button
      type="button"
      className={"re-tb-btn" + (active ? " re-on" : "")}
      title={title}
      aria-label={title}
      aria-pressed={active ? true : false}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

const ICON_SIZE = 13;

export function RichEditor({
  value = "",
  onChange,
  onBlur,
  placeholder = "",
  minHeight = 80,
  flat = false,
  className = "",
  ariaLabel,
  onReady,
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    editorProps: {
      attributes: ariaLabel ? { "aria-label": ariaLabel } : {},
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onBlur: ({ editor }) => {
      onBlur?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const isActive = (
    name: string,
    attrs?: Record<string, unknown>,
  ): boolean => editor.isActive(name, attrs);

  const wrapperClass =
    "re-wrap" + (flat ? " re-flat" : "") + (className ? ` ${className}` : "");

  return (
    <div className={wrapperClass}>
      <div className="re-toolbar" role="toolbar" aria-label="Formatting">
        <ToolbarBtn
          icon={<Bold size={ICON_SIZE} />}
          title="Bold"
          active={isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarBtn
          icon={<Italic size={ICON_SIZE} />}
          title="Italic"
          active={isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarBtn
          icon={<Strikethrough size={ICON_SIZE} />}
          title="Strikethrough"
          active={isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <span className="re-tb-sep" aria-hidden="true" />
        <ToolbarBtn
          icon={<Heading2 size={ICON_SIZE} />}
          title="Heading"
          active={isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarBtn
          icon={<List size={ICON_SIZE} />}
          title="Bullet list"
          active={isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarBtn
          icon={<ListOrdered size={ICON_SIZE} />}
          title="Numbered list"
          active={isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarBtn
          icon={<Quote size={ICON_SIZE} />}
          title="Quote"
          active={isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <span className="re-tb-sep" aria-hidden="true" />
        <ToolbarBtn
          icon={<Code size={ICON_SIZE} />}
          title="Inline code"
          active={isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarBtn
          icon={<Code2 size={ICON_SIZE} />}
          title="Code block"
          active={isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarBtn
          icon={<LinkIcon size={ICON_SIZE} />}
          title="Link"
          active={isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Link URL");
            if (url) {
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
            }
          }}
        />
      </div>
      <EditorContent
        editor={editor}
        className="re-content"
        style={{ minHeight }}
      />
    </div>
  );
}
