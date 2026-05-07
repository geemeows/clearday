// Inbox page — list + detail pane

const { useState: useState_i } = React;

const FILTERS = [
  { id: "all", label: "All", source: null },
  { id: "prs", label: "PRs", source: "git" },
  { id: "tickets", label: "Tickets", source: "task" },
  { id: "mentions", label: "Mentions", source: "slack" },
  { id: "meetings", label: "Meetings", source: "cal" },
];

const InboxRow = ({ s, selected, onClick }) => {
  const ago = window.relAgo(s.age || s.when);
  return (
    <button
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12,
        padding: "14px 18px", border: "none", background: selected ? "var(--surface-soft)" : "transparent",
        borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
        textAlign: "left", cursor: "pointer", width: "100%",
        borderBottom: "1px solid var(--hairline-soft)",
        alignItems: "start",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-soft)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingTop: 2 }}>
        <SourceGlyph source={s.source} size={22} />
        {s.unread > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{s.unread}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {s.severity === "high" && <span className="chip" style={{ fontSize: 10, padding: "1px 7px", background: "var(--danger-soft)", color: "var(--danger)" }}>CI FAIL</span>}
          {s.severity === "warn" && <span className="chip" style={{ fontSize: 10, padding: "1px 7px", background: "var(--warn-soft)", color: "var(--warn)" }}>CONFLICT</span>}
          {s.badge === "auto-rule" && <span className="chip" style={{ fontSize: 10, padding: "1px 7px", background: "var(--surface-strong)", color: "var(--muted)" }}>RULE</span>}
          <span style={{
            fontSize: 14, fontWeight: s.unread ? 600 : 500,
            color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{s.title}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.repo && s.diff ? `${s.repo} ${s.num} · ${s.author} · +${s.diff.add} −${s.diff.del}` : (s.repo ? `${s.repo} ${s.num} · ${s.author}` : s.sub)}
        </div>
      </div>
      <div className="t-mono muted" style={{ fontSize: 11, paddingTop: 3 }}>{ago}</div>
    </button>
  );
};

const InboxList = ({ signals, selectedId, onSelect, filter, setFilter, onDismiss }) => {
  const filtered = filter === "all" ? signals : signals.filter(s => s.source === FILTERS.find(f => f.id === filter).source);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span className="t-display-md">Inbox</span>
          <span className="t-caption muted" style={{ marginLeft: 10 }}>{filtered.filter(f => f.unread > 0).length} unread · {filtered.length} total</span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" style={{ height: 30, padding: "0 12px", fontSize: 12 }}>Mark all read</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map(f => {
            const c = f.source ? signals.filter(s => s.source === f.source).length : signals.length;
            return (
              <button
                key={f.id} onClick={() => setFilter(f.id)}
                className={`chip ${filter === f.id ? "chip-active" : ""}`}
                style={{ border: "none", cursor: "pointer", fontWeight: 500 }}
              >
                {f.label}
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 4 }}>{c}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(s => (
          <InboxRow key={s.id} s={s} selected={s.id === selectedId} onClick={() => onSelect(s.id)} />
        ))}
      </div>
    </div>
  );
};

const PRDetail = ({ s }) => (
  <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="git" size={20} />
      <span className="t-mono muted">{s.repo} {s.num}</span>
      <span style={{ flex: 1 }} />
      <span className="chip" style={{ background: "var(--good-soft)", color: "var(--good)", fontSize: 11 }}>Open · review requested</span>
    </div>
    <h1 className="t-display-lg" style={{ margin: "0 0 14px", color: "var(--ink)" }}>{s.title}</h1>
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#92174d,#ff385c)", color: "white", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>P</div>
        <span style={{ fontSize: 13, fontWeight: 500 }}>priya-w</span>
      </div>
      <span className="t-mono muted" style={{ fontSize: 12 }}>opened 22m ago</span>
      <span className="t-mono" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--good)" }}>+{s.diff.add}</span>
        <span style={{ color: "var(--muted-soft)", margin: "0 4px" }}>·</span>
        <span style={{ color: "var(--danger)" }}>−{s.diff.del}</span>
        <span className="muted">{` across ${s.diff.files} files`}</span>
      </span>
    </div>

    {/* AI summary moment */}
    <div style={{
      padding: "14px 16px", borderRadius: 12, marginBottom: 20,
      background: "var(--src-ai-bg)",
      border: "1px solid var(--hairline-soft)",
      display: "flex", gap: 12, alignItems: "start",
    }}>
      <SourceGlyph source="ai" size={20} />
      <div style={{ flex: 1 }}>
        <div className="t-tag" style={{ color: "var(--src-ai)", marginBottom: 4 }}>AI SUMMARY</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--body)" }}>{s.summary}</div>
      </div>
    </div>

    <div className="t-tag muted" style={{ marginBottom: 8 }}>FILES CHANGED</div>
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 24 }}>
      {[
        { f: "src/slack/webhook.ts", a: 84, d: 12 },
        { f: "src/signals/store.ts", a: 31, d: 14 },
        { f: "src/signals/upsert.test.ts", a: 56, d: 0 },
        { f: "src/cron/dispatch.ts", a: 8, d: 21 },
      ].map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--hairline-soft)" }}>
          <span className="t-mono" style={{ fontSize: 12, color: "var(--body)", flex: 1 }}>{f.f}</span>
          <span className="t-mono" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--good)" }}>+{f.a}</span>
            <span style={{ color: "var(--muted-soft)", margin: "0 4px" }}>·</span>
            <span style={{ color: "var(--danger)" }}>−{f.d}</span>
          </span>
        </div>
      ))}
    </div>

    <div className="t-tag muted" style={{ marginBottom: 8 }}>RECENT COMMENTS</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
      <CommentRow who="priya-w" age="20m" text="Putting this up early — figured we should land the dedup before the Slack adapter ships, otherwise we'll generate dupes on every retry. Tests cover the (provider, kind, source_id) collision path." />
      <CommentRow who="rahulm" age="14m" text="LGTM on the upsert path. One Q on the retry budget — should we cap at 3 or let cron-orchestrator handle it?" />
    </div>

    {/* inline actions */}
    <div style={{ position: "sticky", bottom: 0, background: "var(--surface-card)", padding: "16px 0", borderTop: "1px solid var(--hairline-soft)", display: "flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 5 5L20 7"/></svg>
        Approve
      </button>
      <button className="btn btn-secondary">Request changes</button>
      <button className="btn btn-ghost" style={{ color: "var(--muted)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>
        Draft reply with AI
      </button>
      <span style={{ flex: 1 }} />
      <button className="btn btn-ghost" style={{ color: "var(--muted)", fontSize: 13 }}>Open in GitHub →</button>
    </div>
  </div>
);

const CommentRow = ({ who, age, text }) => (
  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-strong)", color: "var(--ink)", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{who[0].toUpperCase()}</div>
    <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{who}</span>
        <span className="t-mono muted" style={{ fontSize: 11 }}>{age} ago</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>{text}</div>
    </div>
  </div>
);

const SlackDetail = ({ s }) => (
  <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="slack" size={20} />
      <span className="t-mono muted">{s.title}</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 16px" }}>{s.kind === "dm" ? "Direct message" : "Mention"}</h1>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
      {(s.thread || []).map((t, i) => (
        <CommentRow key={i} who={t.who} age={window.relAgo(t.when)} text={t.text} />
      ))}
    </div>

    <div className="t-tag muted" style={{ marginBottom: 8 }}>QUICK REPLY</div>
    <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: 14 }}>
      <textarea
        placeholder="Reply to thread…"
        defaultValue=""
        style={{
          width: "100%", minHeight: 70, border: "none", background: "transparent",
          resize: "none", outline: "none", fontSize: 14, color: "var(--ink)",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="btn btn-ghost" style={{ height: 30, fontSize: 12, color: "var(--muted)" }}>
          ✦ Draft with AI
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ height: 30, fontSize: 12 }}>Cancel</button>
        <button className="btn btn-primary" style={{ height: 30, fontSize: 12 }}>Send</button>
      </div>
    </div>
  </div>
);

const MeetingDetail = ({ s }) => (
  <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="cal" size={20} />
      <span className="t-mono muted">Meeting · 10:00 → 10:15</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 6px" }}>{s.title}</h1>
    <div className="t-body muted">{s.sub}</div>
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="t-tag muted">AGENDA</div>
      {(s.agenda || []).map((a, i) => (
        <div key={i} style={{ fontSize: 14, color: "var(--body)" }}>· {a}</div>
      ))}
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
      <button className="btn btn-primary">Join meeting</button>
      <button className="btn btn-secondary">Open invite</button>
    </div>
  </div>
);

const TaskDetail = ({ s }) => (
  <div style={{ padding: "28px 32px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="task" size={20} />
      <span className="t-mono muted">Linear · DEV-441</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 6px" }}>{s.title}</h1>
    <div className="t-body muted">{s.sub}</div>
  </div>
);

const InboxDetail = ({ s }) => {
  if (!s) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>Select a signal</div>;
  if (s.source === "git") return <PRDetail s={s} />;
  if (s.source === "slack") return <SlackDetail s={s} />;
  if (s.source === "cal") return <MeetingDetail s={s} />;
  return <TaskDetail s={s} />;
};

const InboxPage = () => {
  const [filter, setFilter] = useState_i("all");
  const [selected, setSelected] = useState_i("s2");
  const sigs = window.DevyData.SIGNALS.filter(s => !s.dismissed);
  const sel = sigs.find(s => s.id === selected);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", height: "100%", overflow: "hidden" }}>
      <div style={{ borderRight: "1px solid var(--hairline-soft)", overflow: "hidden" }}>
        <InboxList signals={sigs} selectedId={selected} onSelect={setSelected} filter={filter} setFilter={setFilter} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--canvas)" }}>
        <InboxDetail s={sel} />
      </div>
    </div>
  );
};

window.InboxPage = InboxPage;
