// Cmd-K palette + Focus session modal

const { useState: useS_o, useEffect: useE_o, useRef: useR_o } = React;

const CMDK_RESULTS = [
  { group: "PRs", source: "git", items: [
    { title: "feat(signals): batch upsert path for slack webhook", sub: "clearday/worker #421 · priya-w" },
    { title: "fix(auth-proxy): reject expired state token", sub: "clearday/auth-proxy #88 · you" },
    { title: "feat(briefing): morning briefing prompt + budget guard", sub: "clearday/worker #418 · joonp" },
  ]},
  { group: "Tickets", source: "task", items: [
    { title: "DEV-441 — Add timestamp-replay rejection to slack-webhook", sub: "P1 · In progress" },
    { title: "DEV-447 — Cron orchestrator: idempotent retry tick", sub: "P2 · In progress" },
  ]},
  { group: "Meetings", source: "cal", items: [
    { title: "Standup — Platform team", sub: "Today 10:00 · 9 attendees" },
    { title: "1:1 — Maria", sub: "Today 11:00" },
  ]},
  { group: "Slack", source: "slack", items: [
    { title: "@you in #platform-eng", sub: "priya: hey — can you take a look at #421" },
    { title: "DM — Rahul M.", sub: "re: auth-proxy state token ttl" },
  ]},
];

const CmdK = ({ open, onClose }) => {
  const [q, setQ] = useS_o("");
  const [sel, setSel] = useS_o(0);
  const inputRef = useR_o(null);
  useE_o(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    setQ(""); setSel(0);
  }, [open]);
  if (!open) return null;

  const flat = CMDK_RESULTS.flatMap(g => g.items.map(i => ({ ...i, source: g.source, group: g.group })));
  const filtered = q ? flat.filter(i => i.title.toLowerCase().includes(q.toLowerCase()) || i.sub.toLowerCase().includes(q.toLowerCase())) : flat;
  const grouped = CMDK_RESULTS.map(g => ({ ...g, items: filtered.filter(i => i.group === g.group) })).filter(g => g.items.length > 0);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxHeight: "70vh", background: "var(--surface-card)",
        borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--muted)" }}>{window.NavIcons.search}</span>
          <input
            ref={inputRef}
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search PRs, tickets, meetings, threads…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 16, color: "var(--ink)", background: "transparent" }}
          />
          <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", background: "var(--surface-strong)", padding: "2px 6px", borderRadius: 4 }}>ESC</kbd>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {grouped.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              No matches. Try the AI footer below ↓
            </div>
          )}
          {grouped.map(g => (
            <div key={g.group}>
              <div className="t-tag muted" style={{ padding: "10px 20px 6px" }}>{g.group}</div>
              {g.items.map((i, idx) => (
                <button key={idx} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
                  width: "100%", padding: "10px 20px", border: "none", background: "transparent",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-soft)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <SourceGlyph source={i.source} size={20} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.sub}</div>
                  </div>
                  <span className="t-mono muted" style={{ fontSize: 10 }}>↵</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Ask AI footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--hairline-soft)",
          background: "var(--src-ai-bg)",
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
        }}>
          <SourceGlyph source="ai" size={20} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              Ask AI {q && <span style={{ color: "var(--src-ai)" }}>"{q}"</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Searches across all your signals · Haiku 4.5</div>
          </div>
          <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", background: "var(--canvas)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--hairline)" }}>⌘↵</kbd>
        </div>
      </div>
    </div>
  );
};

// Focus session modal
const FocusModal = ({ open, onClose, onStart }) => {
  const [duration, setDuration] = useS_o(45);
  const [msg, setMsg] = useS_o("Heads down — back at the end of this block");
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 460, background: "var(--surface-card)",
        borderRadius: 16, boxShadow: "var(--shadow-card)",
        padding: 28, display: "flex", flexDirection: "column", gap: 18,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="t-tag" style={{ color: "var(--accent)" }}>FOCUS</span>
          </div>
          <h2 className="t-display-md" style={{ margin: 0 }}>Start a focus session</h2>
          <p className="t-body muted" style={{ marginTop: 6 }}>
            Sets Slack DND, blocks Calendar, silences alerts except <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@mentions</code> and meetings starting in &lt;5 min.
          </p>
        </div>

        <div>
          <div className="t-tag muted" style={{ marginBottom: 8 }}>DURATION</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[25, 45, 60, 90, 120].map(d => (
              <button key={d} onClick={() => setDuration(d)} className={`chip ${duration===d?"chip-active":""}`} style={{ border: "none", cursor: "pointer", fontSize: 13, padding: "7px 14px" }}>
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="t-tag muted" style={{ marginBottom: 8 }}>SLACK STATUS</div>
          <input
            value={msg} onChange={e => setMsg(e.target.value)}
            style={{
              width: "100%", padding: "12px 14px", borderRadius: 8,
              border: "1px solid var(--hairline)", background: "var(--canvas)",
              fontSize: 14, color: "var(--ink)", outline: "none",
            }}
          />
        </div>

        <div style={{ background: "var(--surface-soft)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--body)", lineHeight: 1.6 }}>
          <div className="t-tag muted" style={{ marginBottom: 6 }}>WILL DO</div>
          <div>· Write a Calendar busy event (10:00 → {fmtEnd(duration)})</div>
          <div>· Set Slack status with a {duration}-min auto-expiry</div>
          <div>· Call <code style={{ fontFamily: "var(--font-mono)" }}>dnd.setSnooze</code> for {duration} min</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={() => { onStart(); onClose(); }} className="btn btn-primary">Start {duration}-min focus</button>
        </div>
      </div>
    </div>
  );
};

const fmtEnd = (mins) => {
  const end = new Date();
  end.setHours(10, 0 + mins, 0, 0);
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2,"0")}`;
};

window.CmdK = CmdK;
window.FocusModal = FocusModal;
