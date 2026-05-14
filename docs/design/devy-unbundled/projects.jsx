// Projects page — private kanban with optional linked external (Linear/Jira) cards.
// Replaces the old Tasks page.

const { useState: useS_p, useMemo: useMemo_p } = React;

// ---------- fixture data ----------
const PROJECTS = [
{
  id: "p-platform",
  name: "Platform Q2",
  color: "var(--primary)",
  activeCol: "doing",
  columns: [
  { id: "backlog", name: "Backlog" },
  { id: "doing", name: "In progress" },
  { id: "review", name: "In review" },
  { id: "shipped", name: "Shipped" }],

  cards: [
  { id: "c1", col: "doing", title: "Slack adapter retry budget", desc: "Cap retries at 3 with jitter; emit metric on bail.", priority: "P1", labels: ["infra"], due: "today", linked: { source: "task", id: "DEV-441", repo: "linear" }, linkedSignals: ["s2", "s6"] },
  { id: "c2", col: "doing", title: "Auth-proxy state token TTL audit", desc: "", priority: "P1", labels: ["security"], due: "tomorrow", linked: null, linkedSignals: ["s7"] },
  { id: "c3", col: "review", title: "Cron orchestrator: idempotent retry tick", desc: "PR up — awaiting CI.", priority: "P2", labels: ["infra"], due: null, linked: { source: "task", id: "DEV-447", repo: "linear" }, linkedSignals: [] },
  { id: "c4", col: "backlog", title: "Signal-store upsert benchmarks", desc: "", priority: "P3", labels: ["perf"], due: null, linked: { source: "task", id: "DEV-401", repo: "linear" }, linkedSignals: [] },
  { id: "c5", col: "backlog", title: "Web-push VAPID key rotation flow", desc: "Document rotation cadence.", priority: "P3", labels: ["alerts"], due: null, linked: null, linkedSignals: [] },
  { id: "c6", col: "shipped", title: "Onboarding: Slack-channel allowlist step", desc: "", priority: "P2", labels: ["onboarding"], due: null, linked: { source: "task", id: "DEV-388", repo: "linear" }, linkedSignals: [] }]

},
{
  id: "p-personal",
  name: "Personal",
  color: "#7c3aed",
  activeCol: "doing",
  columns: [
  { id: "ideas", name: "Ideas" },
  { id: "doing", name: "Doing" },
  { id: "done", name: "Done" }],

  cards: [
  { id: "c7", col: "doing", title: "Read 'A Philosophy of Software Design'", desc: "Ch 4–6 this week.", priority: "P3", labels: ["reading"], due: null, linked: null, linkedSignals: [] },
  { id: "c8", col: "ideas", title: "Refactor home dotfiles", desc: "", priority: "P3", labels: [], due: null, linked: null, linkedSignals: [] }]

}];


// ---------- ProjectsPage ----------
const ProjectsPage = () => {
  const [projects, setProjects] = useS_p(PROJECTS);
  const [activeId, setActiveId] = useS_p("p-platform");
  const project = projects.find((p) => p.id === activeId);
  const [creatingProject, setCreatingProject] = useS_p(false);
  const [openCard, setOpenCard] = useS_p(null);
  const [linkPickerCardId, setLinkPickerCardId] = useS_p(null);

  const updateProject = (id, fn) => setProjects((ps) => ps.map((p) => p.id === id ? fn(p) : p));

  const moveCard = (cardId, toCol) => updateProject(activeId, (p) => ({
    ...p,
    cards: p.cards.map((c) => c.id === cardId ? { ...c, col: toCol } : c)
  }));

  const addCard = (col) => updateProject(activeId, (p) => ({
    ...p,
    cards: [...p.cards, {
      id: "c" + Date.now(),
      col, title: "Untitled", desc: "",
      priority: "P3", labels: [], due: null, linked: null, linkedSignals: []
    }]
  }));

  const updateCard = (cardId, patch) => updateProject(activeId, (p) => ({
    ...p,
    cards: p.cards.map((c) => c.id === cardId ? { ...c, ...patch } : c)
  }));

  const linkSignal = (cardId, sigId) => updateProject(activeId, (p) => ({
    ...p,
    cards: p.cards.map((c) => c.id === cardId ?
    { ...c, linkedSignals: c.linkedSignals.includes(sigId) ? c.linkedSignals : [...c.linkedSignals, sigId] } :
    c)
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "24px 36px 16px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 14 }}>
        <ProjectSwitcher
          projects={projects} activeId={activeId} setActiveId={setActiveId}
          onNew={() => setCreatingProject(true)} />
        <span style={{ flex: 1 }} />
        <span className="t-caption muted">{project.cards.length} cards · {project.columns.length} columns</span>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", padding: "20px 24px 28px" }}>
        <div style={{ display: "flex", gap: 14, height: "100%", minWidth: project.columns.length * 296 }}>
          {project.columns.map((col) =>
          <KanbanColumn
            key={col.id} col={col} project={project}
            cards={project.cards.filter((c) => c.col === col.id)}
            onMove={moveCard} onAdd={() => addCard(col.id)}
            onOpen={(c) => setOpenCard(c)} />

          )}
        </div>
      </div>

      {creatingProject && <NewProjectModal onClose={() => setCreatingProject(false)} onCreate={(np) => {setProjects((ps) => [...ps, np]);setActiveId(np.id);setCreatingProject(false);}} />}
      {openCard &&
      <CardDetailModal
        card={project.cards.find((c) => c.id === openCard.id)}
        project={project}
        onClose={() => setOpenCard(null)}
        onUpdate={(patch) => updateCard(openCard.id, patch)}
        onLinkSignal={() => setLinkPickerCardId(openCard.id)} />

      }
      {linkPickerCardId &&
      <SignalLinkPicker
        onClose={() => setLinkPickerCardId(null)}
        onPick={(sigId) => {linkSignal(linkPickerCardId, sigId);setLinkPickerCardId(null);}}
        alreadyLinked={project.cards.find((c) => c.id === linkPickerCardId)?.linkedSignals || []} />

      }
    </div>);

};

// ---------- Project switcher — Career-style dropdown ----------
const ProjectSwitcher = ({ projects, activeId, setActiveId, onNew }) => {
  const active = projects.find((p) => p.id === activeId);
  const [open, setOpen] = useS_p(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "6px 12px", borderRadius: "var(--radius-md)", cursor: "pointer",
        background: "var(--surface-card)", border: "1px solid var(--border)",
        color: "var(--foreground)"
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: active.color }} />
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>{active.name}</span>
        <span className="t-mono" style={{ fontSize: 10.5, color: "var(--muted-foreground)",
          padding: "1px 6px", borderRadius: 4, background: "var(--surface-strong)",
          border: "1px solid var(--hairline)" }}>{active.cards.length}</span>
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
          width: 320, background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4
        }}>
          <div className="t-tag" style={{ padding: "8px 10px 4px" }}>Active</div>
          <div style={{ padding: "8px 10px", borderRadius: 6, background: "var(--accent-tint)",
            display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: active.color }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{active.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                {active.cards.length} cards · {active.columns.length} columns
              </div>
            </div>
          </div>
          <div className="t-tag" style={{ padding: "12px 10px 4px" }}>All projects</div>
          {projects.filter(p => p.id !== activeId).map(p => (
            <button key={p.id} onClick={() => { setActiveId(p.id); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px",
              borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", textAlign: "left"
            }} onMouseEnter={e => e.currentTarget.style.background = "var(--accent)"}
               onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color }} />
              <span style={{ flex: 1, fontSize: 13, color: "var(--foreground)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span className="t-mono" style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>{p.cards.length}</span>
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 4, paddingTop: 4 }}>
            <button onClick={() => { setOpen(false); onNew(); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
              borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
              color: "var(--primary)", fontSize: 13, fontWeight: 500
            }} onMouseEnter={e => e.currentTarget.style.background = "var(--accent)"}
               onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Icon name="plus" size={13} /> New blank project…
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
// ---------- Column ----------
const KanbanColumn = ({ col, project, cards, onMove, onAdd, onOpen }) => {
  const [dragOver, setDragOver] = useS_p(false);
  const isActive = col.id === project.activeCol;
  return (
    <div
      onDragOver={(e) => {e.preventDefault();setDragOver(true);}}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {setDragOver(false);const id = e.dataTransfer.getData("text/card-id");if (id) onMove(id, col.id);}}
      style={{
        width: 282, flexShrink: 0,
        display: "flex", flexDirection: "column",
        background: dragOver ? "var(--primary-disabled)" : "var(--surface-soft)",
        borderRadius: 12, padding: 10,
        border: dragOver ? "1.5px dashed var(--primary)" : "1px solid transparent",
        transition: "background .12s"
      }}>
      
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 10px" }}>
        {isActive && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--primary)" }} title="Active column — surfaces on Today" />}
        <span className="t-title-sm" style={{ color: "var(--ink)" }}>{col.name}</span>
        <span className="t-mono muted" style={{ fontSize: 11 }}>{cards.length}</span>
        <span style={{ flex: 1 }} />
        <button onClick={onAdd} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 16, padding: 2, lineHeight: 1, borderRadius: 4 }}>+</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1, minHeight: 100 }}>
        {cards.map((c) => <KanbanCard key={c.id} card={c} onOpen={onOpen} />)}
        {cards.length === 0 && <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--muted-soft)", fontSize: 11 }}>Empty · drop cards here</div>}
      </div>
    </div>);

};

// ---------- Card ----------
const KanbanCard = ({ card, onOpen }) => {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/card-id", card.id)}
      onClick={() => onOpen(card)}
      style={{
        padding: "10px 12px", borderRadius: 10,
        background: "var(--surface-card)", border: "1px solid var(--hairline)",
        cursor: "pointer", boxShadow: "0 1px 1px rgba(0,0,0,.02)"
      }}>
      
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {card.linked &&
        <span title={`Linked from ${card.linked.repo}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <SourceGlyph source={card.linked.source} size={12} />
            <span className="t-mono" style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)" }}>{card.linked.id}</span>
          </span>
        }
        <span className="chip" style={{
          fontSize: 9, padding: "1px 6px",
          background: card.priority === "P1" ? "var(--danger-soft)" : card.priority === "P2" ? "var(--warn-soft)" : "var(--surface-strong)",
          color: card.priority === "P1" ? "var(--danger)" : card.priority === "P2" ? "var(--warn)" : "var(--muted)"
        }}>{card.priority}</span>
        {card.due === "today" && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--primary-disabled)", color: "var(--primary-active)" }}>DUE TODAY</span>}
        {card.due === "tomorrow" && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--surface-strong)", color: "var(--muted)" }}>TOMORROW</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "var(--ink)", marginBottom: card.labels.length || card.linkedSignals.length ? 8 : 0 }}>{card.title}</div>
      {(card.labels.length > 0 || card.linkedSignals.length > 0) &&
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {card.labels.map((l) =>
        <span key={l} className="t-mono" style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)", background: "var(--surface-soft)", padding: "1px 6px", borderRadius: 4 }}>{l}</span>
        )}
          {card.linkedSignals.length > 0 &&
        <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
              {card.linkedSignals.length}
            </span>
        }
        </div>
      }
    </div>);

};

// ---------- New project modal ----------
const NewProjectModal = ({ onClose, onCreate }) => {
  const [name, setName] = useS_p("");
  const [columns, setColumns] = useS_p([
  { id: "todo", name: "To do" },
  { id: "doing", name: "Doing" },
  { id: "done", name: "Done" }]
  );
  const [active, setActive] = useS_p("doing");

  const updateCol = (i, name) => setColumns((cs) => cs.map((c, idx) => idx === i ? { ...c, name } : c));
  const removeCol = (i) => setColumns((cs) => cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs);
  const addCol = () => setColumns((cs) => [...cs, { id: "col" + Date.now(), name: "New column" }]);
  const moveCol = (i, dir) => setColumns((cs) => {
    const j = i + dir;
    if (j < 0 || j >= cs.length) return cs;
    const next = [...cs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const create = () => {
    if (!name.trim() || columns.length === 0) return;
    onCreate({
      id: "p-" + Date.now(), name: name.trim(),
      color: "#0a8754", activeCol: active,
      columns, cards: []
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--canvas)", borderRadius: 14, width: 520, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div className="t-display-md" style={{ marginBottom: 4 }}>New project</div>
        <div className="t-body-sm muted" style={{ marginBottom: 18 }}>Define your columns now — they're hard to reorganize later.</div>

        <div className="t-tag muted" style={{ marginBottom: 6 }}>NAME</div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform Q2"
        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--hairline)", fontSize: 14, outline: "none", marginBottom: 18, background: "var(--canvas)", color: "var(--ink)" }} />

        <div className="t-tag muted" style={{ marginBottom: 6 }}>COLUMNS · IN ORDER</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {columns.map((c, i) =>
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, background: "var(--surface-soft)", borderRadius: 8 }}>
              <span className="t-mono muted" style={{ fontSize: 11, width: 18, textAlign: "center" }}>{i + 1}</span>
              <input value={c.name} onChange={(e) => updateCol(i, e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--hairline-soft)", fontSize: 13, outline: "none", background: "var(--canvas)", color: "var(--ink)" }} />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: active === c.id ? "var(--primary-active)" : "var(--muted)", cursor: "pointer" }}>
                <input type="radio" checked={active === c.id} onChange={() => setActive(c.id)} />
                Active
              </label>
              <button onClick={() => moveCol(i, -1)} disabled={i === 0} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: i === 0 ? "default" : "pointer", padding: 4, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
              <button onClick={() => moveCol(i, 1)} disabled={i === columns.length - 1} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: i === columns.length - 1 ? "default" : "pointer", padding: 4, opacity: i === columns.length - 1 ? 0.3 : 1 }}>↓</button>
              <button onClick={() => removeCol(i)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
            </div>
          )}
        </div>
        <button onClick={addCol} style={{ border: "1px dashed var(--hairline)", background: "transparent", padding: "6px 12px", borderRadius: 6, color: "var(--muted)", fontSize: 12, fontWeight: 500, cursor: "pointer", marginBottom: 8 }}>+ Add column</button>
        <div className="t-mono muted" style={{ fontSize: 10, marginBottom: 18 }}>Active column = the one that surfaces on the Today page's "In progress" widget.</div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={!name.trim()}>Create project</Button>
        </div>
      </div>
    </div>);

};

// ---------- Card detail modal ----------
const CardDetailModal = ({ card, project, onClose, onUpdate, onLinkSignal }) => {
  const sigsById = useMemo_p(() => Object.fromEntries(window.DevyData.SIGNALS.map((s) => [s.id, s])), []);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--canvas)", borderRadius: 14, width: 640, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.25)", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {card.linked &&
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", background: "var(--surface-strong)", borderRadius: 6 }}>
              <SourceGlyph source={card.linked.source} size={14} />
              <span className="t-mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>{card.linked.id}</span>
              <span className="t-mono muted" style={{ fontSize: 10 }}>linked</span>
            </span>
          }
          <span className="chip" style={{
            fontSize: 10, padding: "2px 8px",
            background: card.priority === "P1" ? "var(--danger-soft)" : card.priority === "P2" ? "var(--warn-soft)" : "var(--surface-strong)",
            color: card.priority === "P1" ? "var(--danger)" : card.priority === "P2" ? "var(--warn)" : "var(--muted)"
          }}>{card.priority}</span>
          <span style={{ flex: 1 }} />
          <span className="t-mono muted" style={{ fontSize: 11 }}>{project.name} · {project.columns.find((c) => c.id === card.col)?.name}</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        <input value={card.title} onChange={(e) => onUpdate({ title: e.target.value })}
        style={{ width: "100%", border: "none", outline: "none", fontSize: 22, fontWeight: 600, color: "var(--ink)", padding: "4px 0", marginBottom: 14, background: "transparent" }} />

        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "10px 14px", marginBottom: 18, fontSize: 13 }}>
          <span style={{ color: "var(--muted)" }}>Priority</span>
          <select value={card.priority} onChange={(e) => onUpdate({ priority: e.target.value })} style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "var(--canvas)", color: "var(--ink)", width: 80 }}>
            <option>P1</option><option>P2</option><option>P3</option>
          </select>
          <span style={{ color: "var(--muted)" }}>Due</span>
          <select value={card.due || ""} onChange={(e) => onUpdate({ due: e.target.value || null })} style={{ border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 8px", fontSize: 12, background: "var(--canvas)", color: "var(--ink)", width: 140 }}>
            <option value="">No due date</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="this-week">This week</option>
          </select>
          <span style={{ color: "var(--muted)" }}>Labels</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.labels.map((l) =>
            <span key={l} className="t-mono" style={{ fontSize: 10, fontWeight: 500, color: "var(--muted)", background: "var(--surface-soft)", padding: "2px 7px", borderRadius: 4 }}>{l}</span>
            )}
            <button style={{ border: "1px dashed var(--hairline)", background: "transparent", padding: "1px 7px", borderRadius: 4, color: "var(--muted)", fontSize: 10, cursor: "pointer" }}>+ Add</button>
          </div>
        </div>

        <div className="t-tag muted" style={{ marginBottom: 6 }}>DESCRIPTION</div>
        <div style={{ marginBottom: 18 }}>
          <RichEditor
            value={card.desc}
            onChange={(html) => onUpdate({ desc: html })}
            placeholder="Notes, context, links…"
            minHeight={92} />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
          <span className="t-tag muted">LINKED SIGNALS</span>
          <span className="t-mono muted" style={{ fontSize: 11, marginLeft: 6 }}>{card.linkedSignals.length}</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="plus" onClick={onLinkSignal}>Link signal</Button>
        </div>
        {card.linkedSignals.length > 0 ?
        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--hairline-soft)", borderRadius: 8, overflow: "hidden", marginBottom: 18 }}>
            {card.linkedSignals.map((sid, i, arr) => {
            const s = sigsById[sid];if (!s) return null;
            return (
              <div key={sid} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: i < arr.length - 1 ? "1px solid var(--hairline-soft)" : "none" }}>
                  <SourceGlyph source={s.source} size={16} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.repo ? `${s.repo} ${s.num}` : s.sub || ""}</div>
                  </div>
                  <button onClick={() => onUpdate({ linkedSignals: card.linkedSignals.filter((x) => x !== sid) })} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1 }}>×</button>
                </div>);

          })}
          </div> :

        <div style={{ padding: "10px 12px", border: "1px dashed var(--hairline)", borderRadius: 8, fontSize: 12, color: "var(--muted-soft)", textAlign: "center", marginBottom: 18 }}>
            No signals linked. PRs, mentions, and tickets you connect here will keep this card in context.
          </div>
        }

        {card.linked &&
        <>
            <div className="t-tag muted" style={{ marginBottom: 6 }}>EXTERNAL SOURCE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-soft)", borderRadius: 8, fontSize: 12, color: "var(--body)" }}>
              <SourceGlyph source={card.linked.source} size={16} />
              <span style={{ flex: 1 }}>This card mirrors <b style={{ color: "var(--ink)" }}>{card.linked.id}</b> in {card.linked.repo}. Edits sync back via API.</span>
              <Button variant="secondary" size="sm">Open in {card.linked.repo}</Button>
            </div>
          </>
        }
      </div>
    </div>);

};

// ---------- Signal link picker ----------
const SignalLinkPicker = ({ onClose, onPick, alreadyLinked }) => {
  const [q, setQ] = useS_p("");
  const items = window.DevyData.SIGNALS.filter((s) =>
  !alreadyLinked.includes(s.id) && (
  !q || (s.title || "").toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 110, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--canvas)", borderRadius: 14, width: 540, padding: 18, boxShadow: "0 20px 60px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
        <div className="t-display-md" style={{ marginBottom: 12, fontSize: 18 }}>Link a signal</div>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PRs, mentions, tickets…"
        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--hairline)", fontSize: 13, outline: "none", marginBottom: 12, background: "var(--canvas)", color: "var(--ink)" }} />
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--hairline-soft)", borderRadius: 8 }}>
          {items.map((s, i, arr) =>
          <button key={s.id} onClick={() => onPick(s.id)} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center",
            padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
            borderBottom: i < arr.length - 1 ? "1px solid var(--hairline-soft)" : "none"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-soft)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            
              <SourceGlyph source={s.source} size={18} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.repo ? `${s.repo} ${s.num}` : s.sub || ""}</div>
              </div>
              <span className="t-mono muted" style={{ fontSize: 10 }}>link →</span>
            </button>
          )}
          {items.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--muted-soft)", fontSize: 12 }}>No matching signals.</div>}
        </div>
      </div>
    </div>);

};

window.ProjectsPage = ProjectsPage;
window.ProjectsData = PROJECTS;