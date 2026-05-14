// Devy app shell — sidebar + topbar + page slot. Migrated to coss primitives.

const { useState, useEffect, useMemo } = React;

const NavItem = ({ icon, label, badge, active, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2.5 text-left rounded-md transition-colors"
    style={{
      padding: "6px 8px",
      background: active ? "var(--secondary)" : "transparent",
      color: active ? "var(--foreground)" : "var(--muted-foreground)",
      fontSize: 13, fontWeight: active ? 600 : 500,
      border: "none", cursor: "pointer",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--accent)"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
  >
    <Icon name={icon} size={15} />
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && badge > 0 && (
      <span className="badge" style={{
        background: active ? "var(--primary)" : "var(--secondary)",
        color: active ? "var(--primary-foreground)" : "var(--secondary-foreground)",
        borderColor: "transparent", minWidth: 18, justifyContent: "center",
      }}>{badge}</span>
    )}
  </button>
);

// Lucide icon name map for nav items + topbar
const NAV_ICONS = {
  today: "calendar-clock",
  inbox: "inbox",
  tasks: "list-checks",
  cal: "calendar-days",
  auto: "zap",
  set: "settings",
  search: "search",
  focus: "target",
  bell: "bell",
  spark: "sparkles",
  projects: "layout-grid",
  career: "trending-up",
};

const Sidebar = ({ page, setPage, focusActive, onStartFocus, sources, openSettings }) => {
  const inboxBadge = window.DevyData.SIGNALS.filter((s) => !s.dismissed && s.requires_action).length;
  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: "var(--surface-soft)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      padding: "12px 10px",
      gap: 14,
    }}>
      {/* brand — devy logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px" }}>
        <img src={(window.__resources && window.__resources.devyLogo) || "devy-logo.png"} alt="Devy" style={{ width: 26, height: 26, display: "block" }} />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.3, color: "var(--foreground)" }}>Devy</span>
      </div>

      {/* search */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("devy:open-cmdk"))}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px", borderRadius: "var(--radius-md)",
          background: "var(--background)", border: "1px solid var(--border)",
          color: "var(--muted-foreground)", fontSize: 12.5, cursor: "pointer", textAlign: "left",
        }}>
        <Icon name="search" size={13} />
        <span style={{ flex: 1 }}>Search anything…</span>
        <span className="kbd">⌘K</span>
      </button>

      {/* nav */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <NavItem icon={NAV_ICONS.today} label="Today" active={page === "today"} onClick={() => setPage("today")} />
        <NavItem icon={NAV_ICONS.inbox} label="Inbox" badge={inboxBadge} active={page === "inbox"} onClick={() => setPage("inbox")} />
        <ProjectsNav page={page} setPage={setPage} />
        <NavItem icon={NAV_ICONS.career} label="Career" active={page === "career"} onClick={() => setPage("career")} />
        <NavItem icon={NAV_ICONS.cal} label="Calendar" active={page === "calendar"} onClick={() => setPage("calendar")} />
        <NavItem icon={NAV_ICONS.auto} label="Automations" active={page === "automations"} onClick={() => setPage("automations")} />
      </div>

      <SourcesRail sources={sources} />

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {focusActive ? (
          <FocusActiveBlock />
        ) : (
          <Button variant="primary" size="md" icon={NAV_ICONS.focus} onClick={onStartFocus} style={{ width: "100%" }}>
            Start focus session
          </Button>
        )}
        <AccountDropdown openSettings={openSettings} />
      </div>
    </aside>
  );
};

const FocusActiveBlock = () => {
  const [remaining, setRemaining] = useState(45 * 60);
  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const pct = remaining / (45 * 60);
  return (
    <div style={{
      padding: 12, borderRadius: "var(--radius-lg)",
      background: "var(--foreground)", color: "var(--background)",
      position: "relative", overflow: "hidden",
    }}>
      <div className="t-tag" style={{ color: "color-mix(in oklab, var(--background) 55%, transparent)" }}>FOCUS · ACTIVE</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -1, fontFamily: "var(--font-mono)" }}>{mm}:{ss}</span>
        <span style={{ fontSize: 11, color: "color-mix(in oklab, var(--background) 60%, transparent)" }}>remaining</span>
      </div>
      <div style={{
        marginTop: 8, height: 3, borderRadius: 999,
        background: "color-mix(in oklab, var(--background) 18%, transparent)", overflow: "hidden",
      }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: "var(--background)", transition: "width 1s linear" }} />
      </div>
      <div style={{ fontSize: 11.5, marginTop: 8, color: "color-mix(in oklab, var(--background) 70%, transparent)" }}>
        Slack DND on · Calendar busy
      </div>
    </div>
  );
};

const SourcesRail = ({ sources }) => {
  const [open, setOpen] = useState(false);
  const warnCount = sources.filter(s => s.status === "warn").length;
  const badCount = sources.filter(s => s.status === "bad").length;
  const allGood = warnCount === 0 && badCount === 0;
  const summaryDot = badCount > 0 ? "bad" : warnCount > 0 ? "warn" : "good";

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 6px", marginBottom: open ? 4 : 0,
          background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left",
        }}>
        <span className="t-tag" style={{ flex: 1, color: "var(--muted-foreground)" }}>SOURCES</span>
        <span className={`dot dot-${summaryDot}`} style={{ width: 6, height: 6 }} />
        <span className="t-mono" style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
          {allGood ? `${sources.length} connected` : badCount > 0 ? `${badCount} down` : `${warnCount} warn`}
        </span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sources.map((s) =>
            <div key={s.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 6px", borderRadius: 6,
            }}>
              <SourceGlyph source={s.id} size={16} />
              <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, color: "var(--foreground)" }}>{s.name}</span>
              {s.count > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted-foreground)" }}>{s.count}</span>}
              <span className={`dot dot-${s.status === "good" ? "good" : s.status === "warn" ? "warn" : "bad"}`} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ProjectsNav = ({ page, setPage }) => {
  const [open, setOpen] = useState(page === "projects");
  const projects = (window.ProjectsData || []);
  const active = page === "projects";
  return (
    <div>
      <button
        onClick={() => { setPage("projects"); setOpen(o => !o); }}
        className="w-full flex items-center gap-2.5 text-left transition-colors"
        style={{
          padding: "6px 8px", borderRadius: "var(--radius-md)",
          background: active ? "var(--secondary)" : "transparent",
          color: active ? "var(--foreground)" : "var(--muted-foreground)",
          fontSize: 13, fontWeight: active ? 600 : 500,
          border: "none", cursor: "pointer",
        }}>
        <Icon name={NAV_ICONS.projects} size={15} />
        <span style={{ flex: 1 }}>Projects</span>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={12} />
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2, paddingLeft: 22, maxHeight: 220, overflowY: "auto" }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => setPage("projects")} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6,
              border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
              color: "var(--muted-foreground)", fontSize: 12.5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: p.color, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span className="t-mono" style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{p.cards.length}</span>
            </button>
          ))}
          <button style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6,
            border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
            color: "var(--muted-foreground)", fontSize: 12,
          }}>+ New project</button>
        </div>
      )}
    </div>
  );
};

// --- Account dropdown (replaces the old gear button + settings tab) ---
const AccountDropdown = ({ openSettings }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  React.useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { theme: next } }, "*");
    document.documentElement.dataset.theme = next;
  };
  const item = (icon, label, action, danger, right) => (
    <button onClick={() => { setOpen(false); action?.(); }} style={{
      display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px",
      borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
      color: danger ? "var(--danger)" : "var(--foreground)", fontSize: 13, textAlign: "left",
    }} onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"}
       onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <Icon name={icon} size={13} />
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o=>!o)} style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "6px 6px", borderRadius: "var(--radius-md)", border: "none", background: open ? "var(--accent)" : "transparent",
        cursor: "pointer", textAlign: "left",
      }} onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--accent)"; }}
         onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "var(--secondary)", color: "var(--foreground)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 600, border: "1px solid var(--border)",
        }}>EK</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}>Erin Kovacs</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            erin@kovacs.dev
          </div>
        </div>
        <Icon name="chevron-up" size={13} />
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4,
        }}>
          {item(theme === "dark" ? "moon" : "sun",
            theme === "dark" ? "Dark theme" : "Light theme",
            flipTheme,
            false,
            <span className="t-mono" style={{
              fontSize: 9.5, color: "var(--muted-foreground)",
              padding: "1px 6px", borderRadius: 4, background: "var(--surface-strong)",
            }}>{theme === "dark" ? "ON" : "OFF"}</span>
          )}
          {item("settings", "Settings", openSettings)}
          <div style={{ height: 1, background: "var(--hairline)", margin: "4px 4px" }} />
          {item("log-out", "Sign out", () => {}, true)}
        </div>
      )}
    </div>
  );
};

window.Sidebar = Sidebar;
window.NavIcons = NAV_ICONS;