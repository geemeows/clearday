// Cmd-K palette + Focus session modal — coss primitives + lucide icons.

const { useState: useS_o, useEffect: useE_o, useRef: useR_o } = React;

const CMDK_RESULTS = [
  { group: "Suggestions", source: "git", items: [
    { title: "feat(signals): batch upsert path for slack webhook", sub: "clearday/worker #421", shortcut: "⌘ P" },
    { title: "DEV-441 — timestamp-replay rejection", sub: "linear · P1 · In progress", shortcut: "⌘ T", source: "task" },
    { title: "Standup — Platform team", sub: "Today 10:00 · 9 attendees", shortcut: "⌘ M", source: "cal" },
    { title: "@you in #platform-eng", sub: "priya: can you take a look at #421", shortcut: "⌘ S", source: "slack" },
    { title: "1:1 — Maria", sub: "Today 11:00", shortcut: "⌘ R", source: "cal" },
  ]},
  { group: "Commands", source: "ai", items: [
    { title: "Start focus session", sub: "blocks calendar, sets slack DND", shortcut: "⌘ F", source: "ai" },
    { title: "Generate morning briefing", sub: "haiku 4.5 · ~$0.003", shortcut: "⌘ ⇧ B", source: "ai" },
    { title: "Triage inbox", sub: "auto-resolve low-priority signals", shortcut: "⌘ I", source: "ai" },
    { title: "Snooze all alerts until 14:00", sub: "slack + cal alerts only", shortcut: "⌘ N", source: "ai" },
  ]},
];

// tiny kbd cap for the footer hints — softer than the global .kbd
const FooterKbd = ({ children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 18, height: 18, padding: "0 4px",
    fontSize: 11, fontFamily: "var(--font-mono)",
    color: "var(--muted-foreground)",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 4,
  }}>{children}</span>
);

const CmdK = ({ open, onClose }) => {
  const [q, setQ] = useS_o("");
  const [selectedIdx, setSelectedIdx] = useS_o(0);
  const inputRef = useR_o(null);
  useE_o(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); setQ(""); setSelectedIdx(0); }, [open]);

  const flat = CMDK_RESULTS.flatMap(g => g.items.map(i => ({ ...i, source: g.source, group: g.group })));
  const filtered = q ? flat.filter(i => i.title.toLowerCase().includes(q.toLowerCase()) || i.sub.toLowerCase().includes(q.toLowerCase())) : flat;
  const grouped = CMDK_RESULTS.map(g => ({ ...g, items: filtered.filter(i => i.group === g.group) })).filter(g => g.items.length > 0);
  const flatSelectable = grouped.flatMap(g => g.items);
  const total = flatSelectable.length;

  useE_o(() => { setSelectedIdx(0); }, [q]);

  useE_o(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(total - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(0, i - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, total]);

  if (!open) return null;

  // build a flat-index per item for selection lookup
  let runningIdx = -1;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh",
    }}>
      {/* Command — coss spec: rounded-md, bg-popover, overflow-hidden flex-col */}
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxHeight: "70vh",
        background: "var(--popover)", color: "var(--popover-foreground)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.24)",
        overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {/* CommandInput wrapper — h-12, items-center, gap-2, border-b, px-3 (coss spec) */}
        <div style={{
          height: 48, padding: "0 12px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <Icon name="search" size={20} style={{ opacity: 0.5, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search for apps and commands..."
            style={{
              flex: 1, height: 40, border: "none", outline: "none",
              fontSize: 14, color: "var(--foreground)", background: "transparent",
            }}
          />
        </div>

        {/* CommandList — overflow-y-auto, scroll-py-1, max-h-300 (coss spec) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 4, maxHeight: 380 }}>
          {grouped.length === 0 && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 14, color: "var(--muted-foreground)" }}>
              No results found.
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.group} style={{ padding: "0 8px", marginBottom: 4 }}>
              {/* CommandGroupLabel — px-2 py-1.5 text-xs font-medium muted */}
              <div style={{
                padding: "6px 8px",
                fontSize: 12, fontWeight: 500,
                color: "var(--muted-foreground)",
              }}>{g.group}</div>
              {g.items.map((i) => {
                runningIdx += 1;
                const isSelected = runningIdx === selectedIdx;
                const myIdx = runningIdx;
                return (
                  <button
                    key={i.title}
                    onMouseEnter={() => setSelectedIdx(myIdx)}
                    style={{
                      /* CommandItem — rounded-sm, px-2 py-2, gap-2 (coss spec) */
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "8px 8px",
                      borderRadius: 6,
                      border: "none", cursor: "default", textAlign: "left",
                      background: isSelected ? "var(--accent)" : "transparent",
                      color: isSelected ? "var(--accent-foreground)" : "var(--foreground)",
                      outline: "none",
                      transition: "background 60ms ease",
                    }}
                  >
                    <SourceGlyph source={i.source} size={16} />
                    <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                      <span style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.sub}</span>
                    </div>
                    {/* CommandShortcut — ml-auto text-xs tracking-widest muted */}
                    {i.shortcut && (
                      <span style={{
                        marginLeft: "auto", fontSize: 12,
                        letterSpacing: "0.1em",
                        color: "var(--muted-foreground)",
                        flexShrink: 0,
                      }}>{i.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer — kbd hints: Navigate / Open / Close (CommandFooter — border-t, surface-soft) */}
        <div style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-soft)",
          display: "flex", alignItems: "center", gap: 16,
          fontSize: 12, color: "var(--muted-foreground)",
          flexShrink: 0,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FooterKbd>↑</FooterKbd><FooterKbd>↓</FooterKbd>
            <span style={{ marginLeft: 2 }}>Navigate</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FooterKbd>↵</FooterKbd>
            <span style={{ marginLeft: 2 }}>Open</span>
          </span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <FooterKbd>esc</FooterKbd>
            <span style={{ marginLeft: 2 }}>Close</span>
          </span>
        </div>
      </div>
    </div>
  );
};

const FocusModal = ({ open, onClose, onStart }) => {
  const [duration, setDuration] = useS_o(45);
  const [msg, setMsg] = useS_o("Heads down — back at the end of this block");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} width={460}>
      <DialogHeader onClose={onClose}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <Icon name="target" size={13} />
          <span className="t-tag">FOCUS</span>
        </div>
        <DialogTitle>Start a focus session</DialogTitle>
        <DialogDescription>
          Sets Slack DND, blocks Calendar, silences alerts except <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@mentions</span> and meetings starting in &lt;5 min.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="t-tag" style={{ marginBottom: 6 }}>DURATION</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[25, 45, 60, 90, 120].map(d => (
                <button key={d} onClick={() => setDuration(d)} className={`chip ${duration===d?"chip-active":""}`}
                  style={{ border: duration===d ? "none" : "1px solid var(--border)", cursor: "pointer", padding: "5px 12px" }}>
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="t-tag" style={{ marginBottom: 6 }}>SLACK STATUS</div>
            <Input value={msg} onChange={e => setMsg(e.target.value)} icon="message-square" />
          </div>
          <div style={{ background: "var(--surface-soft)", borderRadius: "var(--radius-md)", padding: 12, fontSize: 12, color: "var(--body)", lineHeight: 1.7, border: "1px solid var(--hairline-soft)" }}>
            <div className="t-tag" style={{ marginBottom: 4 }}>WILL DO</div>
            <div>· Write a Calendar busy event (10:00 → {fmtEnd(duration)})</div>
            <div>· Set Slack status with a {duration}-min auto-expiry</div>
            <div>· Call <span style={{ fontFamily: "var(--font-mono)" }}>dnd.setSnooze</span> for {duration} min</div>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="play" onClick={() => { onStart(); onClose(); }}>Start {duration}-min focus</Button>
      </DialogFooter>
    </Dialog>
  );
};

const fmtEnd = (mins) => {
  const end = new Date();
  end.setHours(10, mins, 0, 0);
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2,"0")}`;
};

window.CmdK = CmdK;
window.FocusModal = FocusModal;
