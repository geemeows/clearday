// Settings page — Integrations, Notifications, Inbox rules, AI provider, Self-host

const { useState: useS_s } = React;

const SETTINGS_TABS = [
  { id: "integrations", label: "Integrations" },
  { id: "notifications", label: "Notifications" },
  { id: "rules", label: "Inbox rules" },
  { id: "ai", label: "AI provider" },
  { id: "selfhost", label: "Self-host" },
  { id: "profile", label: "Profile" },
];

const SettingsPage = ({ onBack }) => {
  const [tab, setTab] = useS_s("integrations");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100%" }}>
      <aside style={{ borderRight: "1px solid var(--hairline-soft)", padding: "24px 14px", background: "var(--surface-soft)" }}>
        <button onClick={onBack} className="btn btn-ghost" style={{ height: 28, fontSize: 12, color: "var(--muted)", marginBottom: 14, padding: "0 8px" }}>← Back</button>
        <div className="t-display-md" style={{ padding: "0 8px", marginBottom: 14 }}>Settings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SETTINGS_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 10px", borderRadius: 8, border: "none",
              background: tab === t.id ? "var(--surface-strong)" : "transparent",
              fontSize: 14, fontWeight: tab === t.id ? 600 : 500,
              color: tab === t.id ? "var(--ink)" : "var(--body)",
              textAlign: "left", cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>
      </aside>
      <main style={{ overflowY: "auto", padding: "32px 40px 64px" }}>
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "notifications" && <NotificationsPanel />}
        {tab === "rules" && <RulesPanel />}
        {tab === "ai" && <AIPanel />}
        {tab === "selfhost" && <SelfHostPanel />}
        {tab === "profile" && <ProfilePanel />}
      </main>
    </div>
  );
};

const SectionHead = ({ title, sub }) => (
  <div style={{ marginBottom: 18 }}>
    <h2 className="t-display-md" style={{ margin: 0 }}>{title}</h2>
    {sub && <p className="t-body muted" style={{ margin: "4px 0 0" }}>{sub}</p>}
  </div>
);

const Row = ({ children, last }) => (
  <div style={{
    display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
    padding: "14px 16px",
    borderBottom: last ? "none" : "1px solid var(--hairline-soft)",
  }}>{children}</div>
);

const Toggle = ({ on, onChange }) => (
  <button onClick={() => onChange(!on)} style={{
    width: 36, height: 20, borderRadius: 999, border: "none",
    background: on ? "var(--accent)" : "var(--border-strong)",
    position: "relative", cursor: "pointer", padding: 0, transition: "background .15s",
  }}>
    <span style={{
      position: "absolute", top: 2, left: on ? 18 : 2,
      width: 16, height: 16, borderRadius: "50%", background: "white",
      transition: "left .15s",
    }} />
  </button>
);

const IntegrationsPanel = () => {
  const [conn, setConn] = useS_s({ git: true, slack: true, cal: true, task: true });
  const items = [
    { id: "git", name: "GitHub", desc: "PR reviews, CI status, comments. Cron-polled across all repos.", scopes: "repo, read:user", status: "good", last: "polled 32s ago" },
    { id: "slack", name: "Slack", desc: "DMs, @mentions, threads you're in. Events API webhook · live.", scopes: "channels:history, chat:write, dnd:write", status: "good", last: "live · 2 events / min" },
    { id: "cal", name: "Google Calendar", desc: "Primary calendar · accepted/tentative · meetings with video link.", scopes: "calendar.events", status: "good", last: "polled 1m ago" },
    { id: "task", name: "Linear", desc: "Assigned tickets, in-progress widget. Cron-polled.", scopes: "read, write:comments", status: "warn", last: "rate-limited · retry 0:42" },
  ];
  return (
    <div>
      <SectionHead title="Integrations" sub="Per-user backend — refresh tokens stored in your own Supabase, never on shared infrastructure." />
      <div className="card" style={{ overflow: "hidden" }}>
        {items.map((i, idx) => (
          <Row key={i.id} last={idx === items.length - 1}>
            <SourceGlyph source={i.id} size={32} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{i.name}</span>
                <span className={`dot dot-${i.status === "good" ? "good" : "warn"}`} />
                <span className="t-mono muted" style={{ fontSize: 11 }}>{i.last}</span>
              </div>
              <div className="t-body-sm muted" style={{ marginTop: 2 }}>{i.desc}</div>
              <div className="t-mono muted" style={{ fontSize: 10, marginTop: 4 }}>scopes: {i.scopes}</div>
            </div>
            <button className="btn btn-secondary" style={{ height: 32, fontSize: 12 }}>Reauthorize</button>
            <Toggle on={conn[i.id]} onChange={v => setConn(c => ({ ...c, [i.id]: v }))} />
          </Row>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <h3 className="t-title-md" style={{ margin: "0 0 8px" }}>Slack channel allowlist</h3>
        <p className="t-body-sm muted" style={{ margin: "0 0 12px" }}>Capture <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@here</code> / <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@channel</code> only in these channels.</p>
        <div className="card" style={{ padding: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["#incidents", "#platform-eng", "#oncall", "#deploys"].map(c => (
            <span key={c} className="chip" style={{ background: "var(--surface-strong)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {c} <span style={{ marginLeft: 6, color: "var(--muted)", cursor: "pointer" }}>×</span>
            </span>
          ))}
          <button className="chip chip-outline" style={{ border: "1px dashed var(--hairline)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>+ Add channel</button>
        </div>
      </div>
    </div>
  );
};

const NotificationsPanel = () => {
  const [channels, setChannels] = useS_s({ push: true, slack: true, email: false, desktop: true });
  const [matrix, setMatrix] = useS_s({
    "PR review": { push: true, slack: true, email: false, desktop: true, sound: false },
    "@mention": { push: true, slack: true, email: false, desktop: true, sound: true },
    "CI failure": { push: true, slack: false, email: true, desktop: true, sound: true },
    "Meeting in 10m": { push: true, slack: false, email: false, desktop: true, sound: true },
    "Ticket comment": { push: false, slack: true, email: false, desktop: false, sound: false },
    "Slack broadcast": { push: false, slack: false, email: false, desktop: false, sound: false },
  });
  const setM = (kind, ch) => setMatrix(m => ({ ...m, [kind]: { ...m[kind], [ch]: !m[kind][ch] } }));

  return (
    <div>
      <SectionHead title="Notifications" sub="Choose channels, route per event kind, and define quiet hours." />

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Channels</h3>
      <div className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
        {[
          { id: "push", name: "PWA Web Push", desc: "Browser/OS notifications when Devy is installed as a PWA." },
          { id: "slack", name: "Slack self-DM", desc: "Sends a DM to yourself. Threads keep history." },
          { id: "email", name: "Email digest", desc: "Daily summary at 8:00. Requires SMTP or BYO Resend key." },
          { id: "desktop", name: "Desktop banner", desc: "Native macOS/Windows notification while Devy is open." },
        ].map((c, idx, arr) => (
          <Row key={c.id} last={idx === arr.length - 1}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-strong)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {c.id === "push" && "🔔"}
              {c.id === "slack" && <SourceGlyph source="slack" size={20} />}
              {c.id === "email" && "✉"}
              {c.id === "desktop" && "🖥"}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
              <div className="t-body-sm muted" style={{ marginTop: 2 }}>{c.desc}</div>
            </div>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, color: "var(--muted)" }}>Test</button>
            <Toggle on={channels[c.id]} onChange={v => setChannels(s => ({ ...s, [c.id]: v }))} />
          </Row>
        ))}
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Per-event routing</h3>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-soft)" }}>
              <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--muted)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>Event kind</th>
              {["Push", "Slack", "Email", "Desktop", "Sound"].map(c => (
                <th key={c} style={{ padding: "10px 14px", fontWeight: 600, color: "var(--muted)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix).map(([k, v]) => (
              <tr key={k} style={{ borderTop: "1px solid var(--hairline-soft)" }}>
                <td style={{ padding: "10px 14px", fontWeight: 500 }}>{k}</td>
                {["push", "slack", "email", "desktop", "sound"].map(ch => (
                  <td key={ch} style={{ padding: "8px 14px", textAlign: "center" }}>
                    <button onClick={() => setM(k, ch)} style={{
                      width: 22, height: 22, borderRadius: 5,
                      border: "1px solid " + (v[ch] ? "var(--accent)" : "var(--hairline)"),
                      background: v[ch] ? "var(--accent)" : "var(--canvas)",
                      color: "white", fontSize: 12, cursor: "pointer", padding: 0,
                    }}>
                      {v[ch] ? "✓" : ""}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="t-title-md" style={{ margin: "28px 0 10px" }}>Quiet hours</h3>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Toggle on={true} onChange={() => {}} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>Suppress alerts during quiet hours</span>
          <span className="t-mono muted" style={{ fontSize: 11, marginLeft: "auto" }}>queued and delivered at end</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 14 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
            <div key={d} style={{
              padding: "10px 0", borderRadius: 8, textAlign: "center",
              background: i < 5 ? "var(--ink)" : "var(--surface-strong)",
              color: i < 5 ? "white" : "var(--muted)",
              fontSize: 12, fontWeight: 600,
            }}>
              <div>{d}</div>
              <div className="t-mono" style={{ fontSize: 10, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>
                {i < 5 ? "22:00–08:00" : "all day"}
              </div>
            </div>
          ))}
        </div>
        <div className="t-tag muted" style={{ marginBottom: 6 }}>ALLOW THROUGH</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["@mentions", "CI red on prod", "On-call pages"].map(t => (
            <span key={t} className="chip" style={{ background: "var(--accent-tint)", color: "var(--accent-active)", fontSize: 12 }}>{t} ×</span>
          ))}
          <button className="chip chip-outline" style={{ border: "1px dashed var(--hairline)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>+ Add rule</button>
        </div>
      </div>
    </div>
  );
};

// Tokenized chip — segmented field/op/value for the WHEN clause
const RuleChip = ({ label, value, options, onChange, kind = "value" }) => {
  const colors = {
    field:  { bg: "var(--surface-strong)", fg: "var(--ink)" },
    op:     { bg: "transparent",            fg: "var(--muted)" },
    value:  { bg: "var(--accent-tint)",     fg: "var(--accent-active)" },
  }[kind];
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        appearance: "none", border: "none", outline: "none",
        background: colors.bg, color: colors.fg,
        fontFamily: kind === "value" ? "var(--font-mono)" : "var(--font-sans)",
        fontWeight: kind === "field" ? 600 : 500,
        fontSize: 13, padding: kind === "op" ? "4px 4px" : "5px 22px 5px 10px",
        borderRadius: 6, cursor: "pointer",
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {kind !== "op" && (
        <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 9, pointerEvents: "none" }}>▾</span>
      )}
    </span>
  );
};

const FIELDS = ["source", "author", "channel", "repo", "title contains", "labels include", "diff size", "is draft"];
const OPS_BY_FIELD = {
  "source":         ["is", "is not"],
  "author":         ["is", "is not", "matches"],
  "channel":        ["is", "is not", "in"],
  "repo":           ["is", "is not", "matches"],
  "title contains": ["matches", "doesn't match"],
  "labels include": ["any of", "all of", "none of"],
  "diff size":      [">", "<", "="],
  "is draft":       ["is true", "is false"],
};
const VALUES_BY_FIELD = {
  "source":         ["github", "slack", "calendar", "linear"],
  "author":         ["dependabot", "renovate-bot", "@me", "team:platform"],
  "channel":        ["#eng-announce", "#incidents", "#deploys", "#random"],
  "repo":           ["acme/web", "acme/api", "acme/infra", "acme/*"],
  "title contains": ["prod", "incident", "[WIP]", "lockfile only"],
  "labels include": ["urgent", "blocked", "good-first-issue"],
  "diff size":      ["10 lines", "100 lines", "500 lines"],
  "is draft":       ["—"],
};
const ACTIONS = [
  { id: "snooze",   label: "Snooze",            params: ["1 hour", "4 hours", "1 day", "until tomorrow", "until Monday"] },
  { id: "low",      label: "Mark as low-prio",  params: null },
  { id: "dismiss",  label: "Auto-dismiss",      params: null },
  { id: "bypass",   label: "Bypass quiet hours", params: null },
  { id: "weekly",   label: "Add to weekly review", params: null },
  { id: "tag",      label: "Add tag",           params: ["follow-up", "review", "later", "incident"] },
  { id: "route",    label: "Route to",          params: ["push", "Slack DM", "email", "desktop"] },
];

const RuleBuilder = ({ initial, onSave, onCancel }) => {
  const [matchAll, setMatchAll] = useS_s(initial?.matchAll ?? true);
  const [conds, setConds] = useS_s(initial?.conds ?? [{ field: "source", op: "is", value: "github" }]);
  const [action, setAction] = useS_s(initial?.action ?? "snooze");
  const [actionParam, setActionParam] = useS_s(initial?.actionParam ?? "1 day");

  const updateCond = (i, patch) => setConds(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCond    = () => setConds(cs => [...cs, { field: "author", op: "is", value: "dependabot" }]);
  const removeCond = (i) => setConds(cs => cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs);

  const currentAction = ACTIONS.find(a => a.id === action);

  return (
    <div style={{ background: "var(--canvas)", border: "1.5px solid var(--accent)", borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span className="t-tag" style={{ color: "var(--accent-active)", letterSpacing: 0.6 }}>NEW RULE</span>
        <span style={{ flex: 1 }} />
        <span className="t-mono muted" style={{ fontSize: 11 }}>preview matches <b style={{ color: "var(--ink)" }}>3 signals</b> from last 7d</span>
      </div>

      {/* WHEN */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
        <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", paddingTop: 8, width: 50 }}>WHEN</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "var(--body)" }}>signal matches</span>
            <div style={{ display: "inline-flex", background: "var(--surface-soft)", borderRadius: 6, padding: 2 }}>
              {[["all", true], ["any", false]].map(([l, v]) => (
                <button key={l} onClick={() => setMatchAll(v)} style={{
                  border: "none", padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                  background: matchAll === v ? "var(--canvas)" : "transparent",
                  fontSize: 12, fontWeight: 600,
                  color: matchAll === v ? "var(--ink)" : "var(--muted)",
                  boxShadow: matchAll === v ? "0 1px 2px rgba(0,0,0,.05)" : "none",
                }}>{l}</button>
              ))}
            </div>
            <span style={{ fontSize: 13, color: "var(--body)" }}>of these conditions:</span>
          </div>
          {conds.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 8px", background: "var(--surface-soft)", borderRadius: 8 }}>
              <RuleChip kind="field" value={c.field} options={FIELDS} onChange={v => updateCond(i, { field: v, op: OPS_BY_FIELD[v][0], value: VALUES_BY_FIELD[v][0] })} />
              <RuleChip kind="op"    value={c.op}    options={OPS_BY_FIELD[c.field]} onChange={v => updateCond(i, { op: v })} />
              <RuleChip kind="value" value={c.value} options={VALUES_BY_FIELD[c.field]} onChange={v => updateCond(i, { value: v })} />
              <span style={{ flex: 1 }} />
              {conds.length > 1 && (
                <button onClick={() => removeCond(i)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
              )}
            </div>
          ))}
          <button onClick={addCond} style={{
            border: "1px dashed var(--hairline)", background: "transparent",
            padding: "6px 12px", borderRadius: 6, color: "var(--muted)",
            fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>+ Add condition</button>
        </div>
      </div>

      {/* THEN */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14, paddingTop: 14, borderTop: "1px solid var(--hairline-soft)" }}>
        <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", paddingTop: 8, width: 50 }}>THEN</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--surface-soft)", borderRadius: 8 }}>
          <RuleChip kind="field" value={ACTIONS.find(a => a.id === action)?.label} options={ACTIONS.map(a => a.label)} onChange={v => {
            const a = ACTIONS.find(x => x.label === v);
            setAction(a.id);
            setActionParam(a.params?.[0] ?? null);
          }} />
          {currentAction.params && (
            <RuleChip kind="value" value={actionParam} options={currentAction.params} onChange={setActionParam} />
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, paddingTop: 14, borderTop: "1px solid var(--hairline-soft)" }}>
        <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", width: 50 }}>NAME</span>
        <input defaultValue="Auto-snooze dependabot" style={{
          flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--hairline)",
          background: "var(--canvas)", fontSize: 14, outline: "none", color: "var(--ink)",
        }} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} className="btn btn-ghost" style={{ height: 34, fontSize: 13 }}>Cancel</button>
        <button onClick={onSave} className="btn btn-secondary" style={{ height: 34, fontSize: 13 }}>Test on history</button>
        <button onClick={onSave} className="btn btn-primary" style={{ height: 34, fontSize: 13 }}>Save rule</button>
      </div>
    </div>
  );
};

const RulesPanel = () => {
  const [rules, setRules] = useS_s([
    { when: "PR author is dependabot", then: "Snooze 1 day", on: true, hits: 47 },
    { when: "Slack channel is #eng-announce", then: "Mark as low-priority", on: true, hits: 12 },
    { when: "PR has only lockfile changes", then: "Auto-dismiss", on: false, hits: 31 },
    { when: "Mention contains \"prod\" or \"incident\"", then: "Bypass quiet hours", on: true, hits: 4 },
    { when: "Meeting has no agenda", then: "Add to weekly review", on: false, hits: 8 },
  ]);
  const [editing, setEditing] = useS_s(false);
  const toggle = (i) => setRules(rs => rs.map((r, idx) => idx === i ? { ...r, on: !r.on } : r));

  return (
    <div>
      <SectionHead title="Inbox rules" sub="Pure rule evaluator over Signals — runs after upsert, before alert dispatch." />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <span className="t-body-sm muted">{rules.filter(r => r.on).length} of {rules.length} active · evaluated in order, top-down</span>
        <span style={{ flex: 1 }} />
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn btn-primary" style={{ height: 34, fontSize: 13 }}>+ New rule</button>
        )}
      </div>
      {editing && <RuleBuilder onSave={() => setEditing(false)} onCancel={() => setEditing(false)} />}
      <div className="card" style={{ overflow: "hidden" }}>
        {rules.map((r, i) => (
          <Row key={i} last={i === rules.length - 1}>
            <span className="t-mono muted" style={{ fontSize: 11, fontWeight: 700, width: 24, textAlign: "right" }}>{i + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
              <span className="t-mono" style={{ fontSize: 11, color: "var(--muted)" }}>WHEN</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "3px 8px", borderRadius: 4 }}>{r.when}</code>
              <span className="t-mono" style={{ fontSize: 11, color: "var(--muted)" }}>THEN</span>
              <span style={{ fontWeight: 500 }}>{r.then}</span>
              <span className="t-mono muted" style={{ fontSize: 10, marginLeft: "auto", paddingLeft: 12 }}>{r.hits} hits / 30d</span>
            </div>
            <button className="btn btn-ghost" style={{ height: 28, fontSize: 12, color: "var(--muted)" }}>Edit</button>
            <Toggle on={r.on} onChange={() => toggle(i)} />
          </Row>
        ))}
      </div>
    </div>
  );
};

const AIPanel = () => {
  const [provider, setProvider] = useS_s("anthropic");
  const providers = [
    { id: "anthropic", name: "Anthropic", model: "claude-haiku-4-5" },
    { id: "openai", name: "OpenAI", model: "gpt-4o-mini" },
    { id: "google", name: "Google", model: "gemini-2.5-flash" },
    { id: "groq", name: "Groq", model: "llama-3.3-70b" },
    { id: "ollama", name: "Local Ollama", model: "llama3.2" },
  ];
  return (
    <div>
      <SectionHead title="AI provider" sub="Bring your own key. Devy never stores prompts; spend tracked locally in your Supabase." />

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Provider</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {providers.map(p => (
          <button key={p.id} onClick={() => setProvider(p.id)} style={{
            padding: "16px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
            background: provider === p.id ? "var(--accent-tint)" : "var(--canvas)",
            border: provider === p.id ? "1.5px solid var(--accent)" : "1px solid var(--hairline)",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <div className="t-mono muted" style={{ fontSize: 10 }}>{p.model}</div>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div className="t-tag muted" style={{ marginBottom: 8 }}>API KEY</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
          <input type="password" defaultValue="sk-ant-api03-••••••••••••••••••••••" style={{
            flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--hairline)",
            background: "var(--surface-soft)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none", color: "var(--ink)",
          }} />
          <button className="btn btn-secondary" style={{ height: 38 }}>Validate</button>
        </div>
        <div className="t-mono" style={{ fontSize: 11, color: "var(--good)", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="dot dot-good" /> Last validated 4m ago
        </div>
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Monthly budget</h3>
      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>$8.41</span>
          <span className="t-body muted" style={{ marginLeft: 6 }}>of $25.00 cap</span>
          <span style={{ flex: 1 }} />
          <span className="t-mono muted" style={{ fontSize: 11 }}>34% used · resets May 31</span>
        </div>
        <div style={{ height: 8, background: "var(--surface-strong)", borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: "34%", background: "var(--accent)" }} />
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)" }}>
          <span>↓ <b style={{ color: "var(--ink)" }}>Fallback at 80%</b> ($20.00) → claude-haiku-4-5</span>
          <span>· <b style={{ color: "var(--ink)" }}>Hard stop at 100%</b> ($25.00)</span>
        </div>
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Privacy</h3>
      <div className="card" style={{ overflow: "hidden" }}>
        {[
          { name: "Strip code blocks", desc: "Removes ``` fenced blocks before sending." },
          { name: "Strip file paths", desc: "Replaces /src/foo/bar.ts with [path]." },
          { name: "Strip secrets", desc: "Pattern match: API keys, JWTs, env vars." },
          { name: "Strip PR diffs", desc: "Drops + / − lines entirely." },
          { name: "Disable AI on personal account", desc: "No outbound LLM calls when this profile is active." },
        ].map((r, i, arr) => (
          <Row key={i} last={i === arr.length - 1}>
            <span style={{ width: 22 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
              <div className="t-body-sm muted" style={{ marginTop: 2 }}>{r.desc}</div>
            </div>
            <span />
            <Toggle on={i < 3} onChange={() => {}} />
          </Row>
        ))}
      </div>
    </div>
  );
};

const SelfHostPanel = () => (
  <div>
    <SectionHead title="Self-host" sub="Your deployment. All data and tokens live in your own Supabase + Cloudflare Worker." />
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {[
        ["Deployment URL", "https://devy.kovacs.dev"],
        ["Worker version", "v0.41.2 · deployed 3d ago"],
        ["Supabase project", "dyy-prod-zef.supabase.co"],
        ["Allowed email", "erin@kovacs.dev"],
        ["Auth proxy", "auth.devy.dev (shared, stateless)"],
      ].map(([k, v], i, arr) => (
        <Row key={k} last={i === arr.length - 1}>
          <span style={{ width: 0 }} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}>{v}</code>
          <button className="btn btn-ghost" style={{ height: 26, fontSize: 11, color: "var(--muted)" }}>Copy</button>
        </Row>
      ))}
    </div>
    <h3 className="t-title-md" style={{ margin: "28px 0 10px" }}>Data</h3>
    <div className="card" style={{ padding: 18, display: "flex", gap: 10 }}>
      <button className="btn btn-secondary">Export my data (JSON)</button>
      <button className="btn btn-secondary">Run signal-rollup now</button>
      <span style={{ flex: 1 }} />
      <span className="t-mono muted" style={{ fontSize: 11, alignSelf: "center" }}>1,847 raw signals · 12 rollups · 90-day retention</span>
    </div>
    <h3 className="t-title-md" style={{ margin: "28px 0 10px", color: "var(--danger)" }}>Danger zone</h3>
    <div className="card" style={{ padding: 18, borderColor: "var(--danger-soft)" }}>
      <button className="btn btn-secondary" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>Disconnect all providers</button>
    </div>
  </div>
);

const ProfilePanel = () => (
  <div>
    <SectionHead title="Profile" sub="Used for greeting, AI context, and the avatar." />
    <div className="card" style={{ padding: 22, display: "flex", gap: 18, alignItems: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #ffd1da, #ff385c)", color: "white", fontSize: 24, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>EK</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Erin Kovacs</div>
        <div className="t-body-sm muted">erin@kovacs.dev · GitHub @erinkov</div>
      </div>
      <button className="btn btn-secondary">Sign out</button>
    </div>
  </div>
);

window.SettingsPage = SettingsPage;
