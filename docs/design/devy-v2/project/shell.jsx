// Devy app shell — sidebar + topbar + page slot

const { useState, useEffect, useMemo } = React;

const NavItem = ({ icon, label, badge, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 10px", borderRadius: 8,
      background: active ? "var(--surface-strong)" : "transparent",
      color: active ? "var(--ink)" : "var(--body)",
      fontSize: 14, fontWeight: active ? 600 : 500,
      border: "none", width: "100%", textAlign: "left",
      cursor: "pointer",
    }}
  >
    <span style={{ width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", color: active ? "var(--ink)" : "var(--muted)" }}>
      {icon}
    </span>
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && badge > 0 && (
      <span style={{
        fontSize: 11, fontWeight: 700, color: active ? "var(--canvas)" : "var(--ink)",
        background: active ? "var(--ink)" : "var(--surface-strong)",
        padding: "2px 7px", borderRadius: 999, minWidth: 20, textAlign: "center",
      }}>{badge}</span>
    )}
  </button>
);

const ICONS = {
  today: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  inbox: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6h18v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>,
  tasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg>,
  cal:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>,
  set:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  focus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>,
  bell:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>,
  spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>,
};

const Sidebar = ({ page, setPage, focusActive, onStartFocus, sources, openSettings }) => {
  const inboxBadge = window.DevyData.SIGNALS.filter(s => !s.dismissed && s.requires_action).length;
  return (
    <aside style={{
      width: 248, flexShrink: 0,
      background: "var(--surface-soft)",
      borderRight: "1px solid var(--hairline-soft)",
      display: "flex", flexDirection: "column",
      padding: "16px 12px",
      gap: 18,
    }}>
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px" }}>
        <div style={{
          width: 26, height: 26, borderRadius: 8,
          background: "var(--accent)", color: "var(--on-accent)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, letterSpacing: -0.5,
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.18)",
        }}>D</div>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>Devy</span>
        <span className="t-tag" style={{
          marginLeft: "auto", color: "var(--muted)",
          background: "var(--surface-strong)", padding: "2px 6px", borderRadius: 999,
        }}>SELF-HOSTED</span>
      </div>

      {/* search */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("devy:open-cmdk"))}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px", borderRadius: 999,
          background: "var(--canvas)", border: "1px solid var(--hairline)",
          color: "var(--muted)", fontSize: 13, cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ color: "var(--muted)" }}>{ICONS.search}</span>
        <span style={{ flex: 1 }}>Search anything…</span>
        <kbd style={{
          fontFamily: "var(--font-mono)", fontSize: 11,
          background: "var(--surface-strong)", padding: "2px 6px", borderRadius: 4,
          color: "var(--muted)", border: "1px solid var(--hairline-soft)",
        }}>⌘K</kbd>
      </button>

      {/* nav */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <NavItem icon={ICONS.today} label="Today"    active={page==="today"}    onClick={() => setPage("today")} />
        <NavItem icon={ICONS.inbox} label="Inbox"    badge={inboxBadge} active={page==="inbox"} onClick={() => setPage("inbox")} />
        <NavItem icon={ICONS.tasks} label="Tasks"    badge={3} active={page==="tasks"} onClick={() => setPage("tasks")} />
        <NavItem icon={ICONS.cal}   label="Calendar" active={page==="calendar"} onClick={() => setPage("calendar")} />
      </div>

      {/* sources rail */}
      <div>
        <div className="t-tag muted" style={{ padding: "0 8px", marginBottom: 8 }}>SOURCES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sources.map(s => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "7px 8px", borderRadius: 6,
            }}>
              <SourceGlyph source={s.id} size={18} />
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "var(--body)" }}>{s.name}</span>
              {s.count > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{s.count}</span>}
              <span className={`dot dot-${s.status === "good" ? "good" : s.status === "warn" ? "warn" : "bad"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* footer — focus + user */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {focusActive ? (
          <FocusActiveBlock />
        ) : (
          <button onClick={onStartFocus} className="btn btn-primary" style={{ width: "100%", height: 40 }}>
            {ICONS.focus} Start focus session
          </button>
        )}
        <button
          onClick={openSettings}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "6px 8px", borderRadius: 8, border: "none", background: "transparent",
            cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "linear-gradient(135deg, #ffd1da, #ff385c)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 12, fontWeight: 700,
          }}>EK</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Erin Kovacs</div>
            <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              erin@kovacs.dev
            </div>
          </div>
          <span style={{ color: "var(--muted)" }}>{ICONS.set}</span>
        </button>
      </div>
    </aside>
  );
};

const FocusActiveBlock = () => {
  const [remaining, setRemaining] = useState(45 * 60); // 45 min
  useEffect(() => {
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = remaining / (45 * 60);
  return (
    <div style={{
      padding: 14, borderRadius: 14,
      background: "var(--ink)", color: "var(--canvas)",
      position: "relative", overflow: "hidden",
    }}>
      <div className="t-tag" style={{ color: "rgba(255,255,255,0.5)" }}>FOCUS · ACTIVE</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, fontFamily: "var(--font-mono)" }}>{mm}:{ss}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>remaining</span>
      </div>
      <div style={{
        marginTop: 8, height: 3, borderRadius: 999,
        background: "rgba(255,255,255,0.15)", overflow: "hidden",
      }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: "var(--accent)", transition: "width 1s linear" }} />
      </div>
      <div style={{ fontSize: 12, marginTop: 8, color: "rgba(255,255,255,0.7)" }}>
        Slack DND on · Calendar busy
      </div>
    </div>
  );
};

window.Sidebar = Sidebar;
window.NavIcons = ICONS;
