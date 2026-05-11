// RichEditor — TipTap-backed rich text editor.
// TipTap is loaded as ESM modules from esm.sh in Devy.html and exposed at
// window.TipTap = { Editor, StarterKit, Placeholder, Link }.
// While loading we show a graceful contentEditable fallback so layout doesn't pop.

const { useState: useS_re, useEffect: useE_re, useRef: useR_re } = React;

const useTipTapReady = () => {
  const [ready, setReady] = useS_re(() => !!window.TipTap);
  useE_re(() => {
    if (window.TipTap) return;
    const onLoad = () => setReady(true);
    window.addEventListener("tiptap-loaded", onLoad);
    return () => window.removeEventListener("tiptap-loaded", onLoad);
  }, []);
  return ready;
};

// Inject editor styles once
(() => {
  if (document.getElementById("re-styles")) return;
  const s = document.createElement("style");
  s.id = "re-styles";
  s.textContent = `
    .re-wrap { border: 1px solid var(--hairline-soft); border-radius: 8px; background: var(--surface-soft); display: flex; flex-direction: column; }
    .re-wrap.re-flat { border: none; background: transparent; border-radius: 0; }
    .re-wrap:focus-within { border-color: var(--ink-soft, var(--hairline)); }
    .re-toolbar { display: flex; gap: 1px; padding: 4px 6px; border-bottom: 1px solid var(--hairline-soft); flex-wrap: wrap; align-items: center; }
    .re-wrap.re-flat .re-toolbar { border-bottom: 1px dashed var(--hairline-soft); padding: 2px 0 6px; }
    .re-tb-btn { width: 24px; height: 24px; border: none; background: transparent; border-radius: 4px; cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
    .re-tb-btn:hover { background: var(--surface-card); color: var(--ink); }
    .re-tb-btn.re-on { background: var(--surface-card); color: var(--ink); box-shadow: inset 0 0 0 1px var(--hairline); }
    .re-tb-sep { width: 1px; height: 14px; background: var(--hairline-soft); margin: 0 4px; align-self: center; }
    .re-content { font-size: 13px; color: var(--ink); line-height: 1.55; padding: 10px 12px; outline: none; }
    .re-content .ProseMirror { outline: none; min-height: inherit; }
    .re-content .ProseMirror p { margin: 0 0 6px; }
    .re-content .ProseMirror p:last-child { margin-bottom: 0; }
    .re-content .ProseMirror h1, .re-content .ProseMirror h2, .re-content .ProseMirror h3 { margin: 6px 0 4px; font-weight: 600; }
    .re-content .ProseMirror ul, .re-content .ProseMirror ol { margin: 4px 0 6px; padding-left: 20px; }
    .re-content .ProseMirror li { margin: 1px 0; }
    .re-content .ProseMirror code { font-family: var(--font-mono); font-size: 12px; background: var(--surface-card); padding: 1px 4px; border-radius: 3px; }
    .re-content .ProseMirror pre { background: var(--surface-card); padding: 8px 10px; border-radius: 6px; font-family: var(--font-mono); font-size: 12px; overflow-x: auto; }
    .re-content .ProseMirror a { color: var(--brand-blue); text-decoration: underline; }
    .re-content .ProseMirror blockquote { border-left: 2px solid var(--hairline); padding-left: 10px; color: var(--muted); margin: 4px 0; }
    .re-content .ProseMirror p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      color: var(--muted-soft, var(--muted));
      pointer-events: none;
      float: left;
      height: 0;
    }
  `;
  document.head.appendChild(s);
})();

const ReToolbarBtn = ({ icon, active, disabled, title, onClick }) => (
  <button
    type="button"
    className={"re-tb-btn" + (active ? " re-on" : "")}
    title={title}
    aria-label={title}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}>
    <Icon name={icon} size={13} />
  </button>
);

const RichEditor = ({
  value = "",
  onChange,
  placeholder = "",
  minHeight = 80,
  flat = false,
  className = "",
}) => {
  const ready = useTipTapReady();
  const mountRef = useR_re(null);
  const editorRef = useR_re(null);
  const [, setTick] = useS_re(0);
  const lastEmittedRef = useR_re(value);

  // Initialize TipTap once libs are ready
  useE_re(() => {
    if (!ready || !mountRef.current || editorRef.current) return;
    const { Editor, StarterKit, Placeholder, Link } = window.TipTap;
    const exts = [StarterKit];
    if (Placeholder && placeholder) exts.push(Placeholder.configure({ placeholder }));
    if (Link) exts.push(Link.configure({ openOnClick: false, autolink: true }));

    const ed = new Editor({
      element: mountRef.current,
      extensions: exts,
      content: value || "",
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        lastEmittedRef.current = html;
        if (onChange) onChange(html);
        setTick((n) => n + 1);
      },
      onSelectionUpdate: () => setTick((n) => n + 1),
      onTransaction: () => setTick((n) => n + 1),
    });
    editorRef.current = ed;
    setTick((n) => n + 1);
    return () => {
      ed.destroy();
      editorRef.current = null;
    };
  }, [ready]);

  // External value sync (e.g. when user switches between cards)
  useE_re(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if ((value || "") !== lastEmittedRef.current) {
      lastEmittedRef.current = value || "";
      ed.commands.setContent(value || "", false);
    }
  }, [value]);

  const ed = editorRef.current;
  const isActive = (name, attrs) => !!(ed && ed.isActive && ed.isActive(name, attrs));
  const run = (fn) => () => {
    if (!ed) return;
    fn(ed.chain().focus()).run();
  };

  // Loading fallback — looks like the final editor so layout doesn't shift
  if (!ready) {
    return (
      <div className={"re-wrap " + (flat ? "re-flat " : "") + className} style={{ minHeight: minHeight + 36 }}>
        <div className="re-toolbar" style={{ opacity: 0.4 }}>
          {["bold","italic","list","list-ordered","code","link"].map((i) => (
            <span key={i} className="re-tb-btn"><Icon name={i} size={13} /></span>
          ))}
        </div>
        <div className="re-content" style={{ minHeight, color: "var(--muted-soft)", fontStyle: "italic" }}>{placeholder || "Loading editor…"}</div>
      </div>
    );
  }

  return (
    <div className={"re-wrap " + (flat ? "re-flat " : "") + className}>
      <div className="re-toolbar">
        <ReToolbarBtn icon="bold"          title="Bold (⌘B)"   active={isActive("bold")}   onClick={run((c) => c.toggleBold())} />
        <ReToolbarBtn icon="italic"        title="Italic (⌘I)" active={isActive("italic")} onClick={run((c) => c.toggleItalic())} />
        <ReToolbarBtn icon="strikethrough" title="Strikethrough" active={isActive("strike")} onClick={run((c) => c.toggleStrike())} />
        <span className="re-tb-sep" />
        <ReToolbarBtn icon="heading"       title="Heading"     active={isActive("heading", { level: 2 })} onClick={run((c) => c.toggleHeading({ level: 2 }))} />
        <ReToolbarBtn icon="list"          title="Bullet list" active={isActive("bulletList")}  onClick={run((c) => c.toggleBulletList())} />
        <ReToolbarBtn icon="list-ordered"  title="Numbered list" active={isActive("orderedList")} onClick={run((c) => c.toggleOrderedList())} />
        <ReToolbarBtn icon="quote"         title="Quote"       active={isActive("blockquote")} onClick={run((c) => c.toggleBlockquote())} />
        <span className="re-tb-sep" />
        <ReToolbarBtn icon="code"          title="Inline code" active={isActive("code")}     onClick={run((c) => c.toggleCode())} />
        <ReToolbarBtn icon="code-2"        title="Code block"  active={isActive("codeBlock")} onClick={run((c) => c.toggleCodeBlock())} />
        <ReToolbarBtn icon="link"          title="Link"
          active={isActive("link")}
          onClick={() => {
            if (!ed) return;
            if (ed.isActive("link")) { ed.chain().focus().unsetLink().run(); return; }
            const url = window.prompt("Link URL");
            if (url) ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }} />
      </div>
      <div ref={mountRef} className="re-content" style={{ minHeight }} />
    </div>
  );
};

window.RichEditor = RichEditor;
