// Inbox page — list + detail pane. Migrated to coss primitives + lucide icons.

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
        padding: "12px 16px", border: "none",
        background: selected ? "var(--secondary)" : "transparent",
        borderLeft: selected ? "2px solid var(--primary)" : "2px solid transparent",
        textAlign: "left", cursor: "pointer", width: "100%",
        borderBottom: "1px solid var(--hairline-soft)",
        alignItems: "start",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-soft)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, paddingTop: 2 }}>
        <SourceGlyph source={s.source} size={20} />
        {s.unread > 0 && <span style={{
          fontSize: 9, fontWeight: 700, color: "var(--primary-foreground)",
          background: "var(--primary)", minWidth: 16, padding: "1px 4px",
          borderRadius: 999, textAlign: "center", lineHeight: 1.4,
        }}>{s.unread}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {s.severity === "high" && <Badge variant="danger">CI fail</Badge>}
          {s.severity === "warn" && <Badge variant="warn">Conflict</Badge>}
          {s.badge === "auto-rule" && <Badge>Rule</Badge>}
          <span style={{
            fontSize: 13.5, fontWeight: s.unread ? 600 : 500,
            color: "var(--foreground)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{s.title}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.repo && s.diff ? `${s.repo} ${s.num} · ${s.author} · +${s.diff.add} −${s.diff.del}` : (s.repo ? `${s.repo} ${s.num} · ${s.author}` : s.sub)}
        </div>
      </div>
      <div className="t-mono muted" style={{ fontSize: 11, paddingTop: 3 }}>{ago}</div>
    </button>
  );
};

const InboxList = ({ signals, selectedId, onSelect, filter, setFilter }) => {
  const filtered = filter === "all" ? signals : signals.filter(s => s.source === FILTERS.find(f => f.id === filter).source);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="t-display-md">Inbox</span>
          <span className="t-caption muted" style={{ marginLeft: 10 }}>
            {filtered.filter(f => f.unread > 0).length} unread · {filtered.length} total
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" icon="check-check">Mark all read</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map(f => {
            const c = f.source ? signals.filter(s => s.source === f.source).length : signals.length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`chip ${active ? "chip-active" : ""}`}
                style={{ border: active ? "none" : "1px solid var(--border)", cursor: "pointer", fontWeight: 500 }}
              >
                {f.label}
                <span style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 500 }}>{c}</span>
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

const Avatar = ({ name, size = 24 }) => {
  const initials = name.split(/[-\s]/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--secondary)", color: "var(--foreground)",
      fontSize: size * 0.42, fontWeight: 600,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--border)", flexShrink: 0,
    }}>{initials}</div>
  );
};

const PRDetail = ({ s }) => (
  <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="git" size={18} />
      <span className="t-mono muted">{s.repo} {s.num}</span>
      <span style={{ flex: 1 }} />
      <Badge variant="success" icon="git-pull-request">Open · review requested</Badge>
    </div>
    <h1 className="t-display-lg" style={{ margin: "0 0 12px", color: "var(--foreground)" }}>{s.title}</h1>
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Avatar name="priya-w" size={22} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>priya-w</span>
      </div>
      <span className="t-mono muted" style={{ fontSize: 12 }}>opened 22m ago</span>
      <span className="t-mono" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--good)" }}>+{s.diff.add}</span>
        <span style={{ color: "var(--muted-foreground)", margin: "0 4px" }}>·</span>
        <span style={{ color: "var(--destructive)" }}>−{s.diff.del}</span>
        <span className="muted">{` across ${s.diff.files} files`}</span>
      </span>
    </div>

    {/* AI summary moment */}
    <div style={{
      padding: "12px 14px", borderRadius: "var(--radius-lg)", marginBottom: 20,
      background: "var(--surface-soft)",
      border: "1px solid var(--border)",
      display: "flex", gap: 12, alignItems: "start",
    }}>
      <SourceGlyph source="ai" size={18} />
      <div style={{ flex: 1 }}>
        <div className="t-tag" style={{ marginBottom: 4, color: "var(--src-ai)" }}>AI SUMMARY</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--body)" }}>{s.summary}</div>
      </div>
    </div>

    <div className="t-tag" style={{ marginBottom: 8 }}>FILES CHANGED</div>
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      {[
        { f: "src/slack/webhook.ts", a: 84, d: 12 },
        { f: "src/signals/store.ts", a: 31, d: 14 },
        { f: "src/signals/upsert.test.ts", a: 56, d: 0 },
        { f: "src/cron/dispatch.ts", a: 8, d: 21 },
      ].map((f, i, arr) => (
        <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: i < arr.length - 1 ? "1px solid var(--hairline-soft)" : "none", gap: 8 }}>
          <Icon name="file" size={12} className="muted" />
          <span className="t-mono" style={{ fontSize: 12, color: "var(--body)", flex: 1 }}>{f.f}</span>
          <span className="t-mono" style={{ fontSize: 11.5 }}>
            <span style={{ color: "var(--good)" }}>+{f.a}</span>
            <span style={{ color: "var(--muted-foreground)", margin: "0 4px" }}>·</span>
            <span style={{ color: "var(--destructive)" }}>−{f.d}</span>
          </span>
        </div>
      ))}
    </div>

    <div className="t-tag" style={{ marginBottom: 8 }}>RECENT COMMENTS</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
      <CommentRow who="priya-w" age="20m" text="Putting this up early — figured we should land the dedup before the Slack adapter ships, otherwise we'll generate dupes on every retry. Tests cover the (provider, kind, source_id) collision path." />
      <CommentRow who="rahulm" age="14m" text="LGTM on the upsert path. One Q on the retry budget — should we cap at 3 or let cron-orchestrator handle it?" />
    </div>

    {/* inline actions */}
    <div style={{
      position: "sticky", bottom: 0,
      background: "var(--card)",
      padding: "14px 0", marginTop: -14,
      borderTop: "1px solid var(--border)",
      display: "flex", gap: 8, alignItems: "center",
    }}>
      <Button variant="primary" icon="check">Approve</Button>
      <Button variant="outline" icon="message-square-dashed">Request changes</Button>
      <Button variant="ghost" icon="sparkles">Draft reply with AI</Button>
      <span style={{ flex: 1 }} />
      <Button variant="ghost" iconRight="external-link">Open in GitHub</Button>
    </div>
  </div>
);

const CommentRow = ({ who, age, text }) => (
  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
    <Avatar name={who} size={28} />
    <div style={{ background: "var(--surface-soft)", borderRadius: "var(--radius-md)", padding: "10px 14px", border: "1px solid var(--hairline-soft)" }}>
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
      <SourceGlyph source="slack" size={18} />
      <span className="t-mono muted">{s.title}</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 16px" }}>{s.kind === "dm" ? "Direct message" : "Mention"}</h1>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
      {(s.thread || []).map((t, i) => (
        <CommentRow key={i} who={t.who} age={window.relAgo(t.when)} text={t.text} />
      ))}
    </div>

    <div className="t-tag" style={{ marginBottom: 8 }}>QUICK REPLY</div>
    <div style={{ background: "var(--surface-soft)", borderRadius: "var(--radius-md)", padding: 8, border: "1px solid var(--hairline-soft)" }}>
      <RichEditor
        value=""
        onChange={() => {}}
        placeholder="Reply to thread…"
        minHeight={70}
        flat />
      <div style={{ display: "flex", gap: 8, marginTop: 4, padding: "0 4px 4px", alignItems: "center" }}>
        <Button variant="ghost" size="sm" icon="sparkles">Draft with AI</Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm">Cancel</Button>
        <Button variant="primary" size="sm" icon="send">Send</Button>
      </div>
    </div>
  </div>
);

const MeetingDetail = ({ s }) => (
  <div style={{ padding: "28px 32px", overflowY: "auto", flex: 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="cal" size={18} />
      <span className="t-mono muted">Meeting · 10:00 → 10:15</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 6px" }}>{s.title}</h1>
    <div className="t-body muted">{s.sub}</div>
    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="t-tag">AGENDA</div>
      {(s.agenda || []).map((a, i) => (
        <div key={i} style={{ fontSize: 13.5, color: "var(--body)" }}>· {a}</div>
      ))}
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
      <Button variant="primary" icon="video">Join meeting</Button>
      <Button variant="outline" icon="calendar">Open invite</Button>
    </div>
  </div>
);

const TaskDetail = ({ s }) => (
  <div style={{ padding: "28px 32px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <SourceGlyph source="task" size={18} />
      <span className="t-mono muted">Linear · DEV-441</span>
    </div>
    <h1 className="t-display-md" style={{ margin: "0 0 6px" }}>{s.title}</h1>
    <div className="t-body muted">{s.sub}</div>
  </div>
);

const InboxDetail = ({ s }) => {
  if (!s) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>Select a signal</div>;
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
      <div style={{ borderRight: "1px solid var(--border)", overflow: "hidden" }}>
        <InboxList signals={sigs} selectedId={selected} onSelect={setSelected} filter={filter} setFilter={setFilter} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--background)" }}>
        <InboxDetail s={sel} />
      </div>
    </div>
  );
};

window.InboxPage = InboxPage;
window.Avatar = Avatar;
