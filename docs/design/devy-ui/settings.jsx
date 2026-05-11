// Settings page — Integrations, Notifications, Inbox rules, AI provider, Self-host

const { useState: useS_s } = React;

const SETTINGS_TABS = [
{ id: "integrations", label: "Integrations" },
{ id: "notifications", label: "Notifications" },
{ id: "ai", label: "AI provider" },
{ id: "profile", label: "Profile" }];


const SettingsPage = ({ onBack }) => {
  const [tab, setTab] = useS_s("integrations");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100%" }}>
      <aside style={{ borderRight: "1px solid var(--hairline-soft)", padding: "24px 14px", background: "var(--surface-soft)" }}>
        <span style={{ display: "block", marginBottom: 14 }}><Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack}>Back</Button></span>
        <div className="t-display-md" style={{ padding: "0 8px", marginBottom: 14 }}>Settings</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SETTINGS_TABS.map((t) =>
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 10px", borderRadius: 8, border: "none",
            background: tab === t.id ? "var(--surface-strong)" : "transparent",
            fontSize: 14, fontWeight: tab === t.id ? 600 : 500,
            color: tab === t.id ? "var(--ink)" : "var(--body)",
            textAlign: "left", cursor: "pointer"
          }}>{t.label}</button>
          )}
        </div>
      </aside>
      <main style={{ overflowY: "auto", padding: "32px 40px 64px" }}>
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "notifications" && <NotificationsPanel />}
        {tab === "ai" && <AIPanel />}
        {tab === "profile" && <ProfilePanel />}
      </main>
    </div>);

};

const SectionHead = ({ title, sub }) =>
<div style={{ marginBottom: 18 }}>
    <h2 className="t-display-md" style={{ margin: 0 }}>{title}</h2>
    {sub && <p className="t-body muted" style={{ margin: "4px 0 0" }}>{sub}</p>}
  </div>;


const Row = ({ children, last }) =>
<div style={{
  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
  padding: "14px 16px",
  borderBottom: last ? "none" : "1px solid var(--hairline-soft)"
}}>{children}</div>;


const Toggle = ({ on, onChange }) =>
<button onClick={() => onChange(!on)} style={{
  width: 36, height: 20, borderRadius: 999, border: "none",
  background: on ? "var(--primary)" : "var(--border-strong)",
  position: "relative", cursor: "pointer", padding: 0, transition: "background .15s"
}}>
    <span style={{
    position: "absolute", top: 2, left: on ? 18 : 2,
    width: 16, height: 16, borderRadius: "50%", background: "white",
    transition: "left .15s"
  }} />
  </button>;


const ACCOUNT_COLORS = [
"linear-gradient(135deg, #ffd1da, #ff385c)",
"linear-gradient(135deg, #bfdbfe, #2563eb)",
"linear-gradient(135deg, #ddd6fe, #7c3aed)",
"linear-gradient(135deg, #a7e0c0, #0a8754)",
"linear-gradient(135deg, #fde68a, #b45309)"];


const AccountAvatar = ({ initials, idx = 0, size = 28 }) =>
<div style={{
  width: size, height: size, borderRadius: "50%",
  background: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
  color: "white", fontSize: size * 0.4, fontWeight: 700,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0
}}>{initials}</div>;


const AccountRow = ({ acc, idx, onRemove, isLast }) =>
<div style={{
  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12, alignItems: "center",
  padding: "12px 16px 12px 60px",
  borderBottom: isLast ? "none" : "1px solid var(--hairline-soft)"
}}>
    <AccountAvatar initials={acc.initials} idx={idx} />
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{acc.handle}</span>
        {acc.primary &&
      <span className="t-tag" style={{ padding: "2px 6px", borderRadius: 4, background: "var(--surface-strong)", color: "var(--muted)" }}>PRIMARY</span>
      }
        <span className={`dot dot-${acc.status === "good" ? "good" : acc.status === "warn" ? "warn" : "bad"}`} />
        <span className="t-mono muted" style={{ fontSize: 11 }}>{acc.last}</span>
      </div>
      <div className="t-body-sm muted" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {acc.context}{acc.scopes ? <span className="t-mono" style={{ fontSize: 10, marginLeft: 8, color: "var(--muted-soft)" }}>{acc.scopes}</span> : null}
      </div>
    </div>
    <Button variant="ghost" size="sm">Reauthorize</Button>
    <Button variant="ghost" size="sm" onClick={onRemove} style={{ color: "var(--danger)" }}>Remove</Button>
  </div>;


// Per-provider in-card settings (channel allowlist for Slack, week start for Calendar, etc.)
const ProviderExtras = ({ providerId }) => {
  if (providerId === "slack") return <SlackChannelAllowlist />;
  if (providerId === "cal") return <CalendarWeekStart />;
  return null;
};

const SlackChannelAllowlist = () => (
  <div style={{ padding: "14px 16px", borderTop: "1px solid var(--hairline-soft)", background: "var(--canvas)" }}>
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
      <span className="t-tag muted" style={{ letterSpacing: 0.5 }}>CHANNEL ALLOWLIST</span>
      <span className="t-body-sm muted" style={{ marginLeft: 8 }}>
        Capture <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@here</code> / <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--surface-soft)", padding: "1px 5px", borderRadius: 3 }}>@channel</code> only here.
      </span>
    </div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {["#incidents", "#platform-eng", "#oncall", "#deploys"].map((c) =>
      <span key={c} className="chip" style={{ background: "var(--surface-strong)", fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 10px" }}>
          {c} <span style={{ marginLeft: 6, color: "var(--muted)", cursor: "pointer" }}>×</span>
        </span>
      )}
      <button className="chip chip-outline" style={{ border: "1px dashed var(--hairline)", cursor: "pointer", fontSize: 12, color: "var(--muted)", padding: "4px 10px" }}>+ Add channel</button>
    </div>
  </div>
);

const WEEK_START_OPTIONS = [
  { id: "sun", label: "Sunday" },
  { id: "mon", label: "Monday" },
  { id: "sat", label: "Saturday" }
];

const CalendarWeekStart = () => {
  const [start, setStart] = useS_s(() => {
    try { return localStorage.getItem("devy.weekStart") || "mon"; } catch { return "mon"; }
  });
  const onPick = (id) => {
    setStart(id);
    try { localStorage.setItem("devy.weekStart", id); } catch {}
    window.dispatchEvent(new CustomEvent("devy:weekStartChanged", { detail: id }));
  };
  return (
    <div style={{ padding: "14px 16px", borderTop: "1px solid var(--hairline-soft)", background: "var(--canvas)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div>
          <div className="t-tag muted" style={{ letterSpacing: 0.5 }}>WEEK STARTS ON</div>
          <div className="t-body-sm muted" style={{ marginTop: 4 }}>Affects the week view on the Calendar page and weekly stats.</div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", background: "var(--surface-soft)", borderRadius: 8, padding: 3 }}>
          {WEEK_START_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              style={{
                border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer",
                background: start === o.id ? "var(--canvas)" : "transparent",
                fontSize: 12, fontWeight: 600,
                color: start === o.id ? "var(--ink)" : "var(--muted)",
                boxShadow: start === o.id ? "0 1px 2px rgba(0,0,0,.05)" : "none"
              }}
            >{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

const IntegrationCard = ({ provider, accounts, onRemoveAccount, onAddAccount }) => {
  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 14 }}>
      {/* Provider header */}
      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
        padding: "16px 16px",
        borderBottom: accounts.length > 0 ? "1px solid var(--hairline-soft)" : "none",
        background: "var(--surface-soft)"
      }}>
        <SourceGlyph source={provider.id} size={32} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{provider.name}</span>
            <span className="t-mono muted" style={{ fontSize: 11 }}>
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"} connected
            </span>
          </div>
          <div className="t-body-sm muted" style={{ marginTop: 2 }}>{provider.desc}</div>
        </div>
        <Button variant="secondary" size="sm" icon="plus" onClick={onAddAccount}>Add account</Button>
      </div>
      {/* Accounts */}
      {accounts.map((acc, i) =>
      <AccountRow
        key={acc.id} acc={acc} idx={i}
        onRemove={() => onRemoveAccount(acc.id)}
        isLast={i === accounts.length - 1} />

      )}
      {accounts.length === 0 &&
      <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          No accounts connected. <button onClick={onAddAccount} style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 600, cursor: "pointer", fontSize: 13, padding: 0 }}>Connect one →</button>
        </div>
      }
      <ProviderExtras providerId={provider.id} />
    </div>);

};

const ADD_PRESETS = {
  git: [
  { handle: "erinkov", initials: "EK", context: "Personal · 14 repos · public + private" },
  { handle: "kovacs-acme", initials: "AC", context: "Acme org · 47 repos" }],

  slack: [
  { handle: "kovacs-team.slack.com", initials: "KT", context: "Engineering workspace · 23 channels" },
  { handle: "indiehackers.slack.com", initials: "IH", context: "Community workspace · 4 channels" }],

  cal: [
  { handle: "erin@personal.com", initials: "EP", context: "Personal · primary calendar" },
  { handle: "erin@kovacs.dev", initials: "EK", context: "Work · primary + 2 shared calendars" }],

  task: [
  { handle: "Acme Inc", initials: "AC", context: "Linear workspace · 4 teams" }]

};

const IntegrationsPanel = () => {
  const providers = [
  { id: "git", name: "GitHub", desc: "PR reviews, CI status, comments. Polls each connected account separately." },
  { id: "slack", name: "Slack", desc: "DMs, @mentions, threads. Each workspace gets its own Events API subscription." },
  { id: "cal", name: "Google Calendar", desc: "Per-account: pick which calendars feed your inbox." },
  { id: "task", name: "Linear", desc: "Assigned tickets, in-progress widget. Cron-polled per workspace." }];


  const [accountsByProvider, setAccountsByProvider] = useS_s({
    git: [
    { id: "git-1", handle: "erinkov", initials: "EK", context: "Personal · 14 repos · public + private", scopes: "repo, read:user", status: "good", last: "polled 32s ago", primary: true },
    { id: "git-2", handle: "kovacs-acme", initials: "AC", context: "Acme org · 47 repos · SSO via Okta", scopes: "repo, read:org", status: "good", last: "polled 1m ago", primary: false }],

    slack: [
    { id: "slack-1", handle: "kovacs-team.slack.com", initials: "KT", context: "Engineering workspace · 23 channels", scopes: "channels:history, chat:write", status: "good", last: "live · 2 events / min", primary: true },
    { id: "slack-2", handle: "indiehackers.slack.com", initials: "IH", context: "Community workspace · 4 channels", scopes: "channels:history", status: "good", last: "live", primary: false }],

    cal: [
    { id: "cal-1", handle: "erin@kovacs.dev", initials: "EK", context: "Work · primary + 2 shared calendars", scopes: "calendar.events", status: "good", last: "polled 1m ago", primary: true },
    { id: "cal-2", handle: "erin@personal.com", initials: "EP", context: "Personal · primary calendar only", scopes: "calendar.events.readonly", status: "good", last: "polled 4m ago", primary: false }],

    task: [
    { id: "task-1", handle: "Acme Inc", initials: "AC", context: "Linear workspace · 4 teams · 12 projects", scopes: "read, write:comments", status: "warn", last: "rate-limited · retry 0:42", primary: true }]

  });

  const removeAccount = (provId, accId) => setAccountsByProvider((s) => ({
    ...s,
    [provId]: s[provId].filter((a) => a.id !== accId)
  }));

  const addAccount = (provId) => setAccountsByProvider((s) => {
    const existing = s[provId];
    const presets = ADD_PRESETS[provId] || [];
    const next = presets.find((p) => !existing.some((a) => a.handle === p.handle));
    const newAcc = next || { handle: `account-${existing.length + 1}`, initials: "??", context: "Newly authorized account" };
    return {
      ...s,
      [provId]: [
      ...existing,
      {
        id: `${provId}-${Date.now()}`,
        ...newAcc,
        scopes: "default scopes",
        status: "good",
        last: "just connected",
        primary: existing.length === 0
      }]

    };
  });

  const totalAccounts = Object.values(accountsByProvider).reduce((a, b) => a + b.length, 0);

  return (
    <div>
      <SectionHead title="Integrations" sub="Per-user backend — refresh tokens stored in your own Supabase, never on shared infrastructure. Connect multiple accounts per provider to merge work and personal contexts in one inbox." />
      {/* Career → Sheets scope upgrade banner */}
      <div style={{
        marginBottom: 14, padding: 14,
        borderRadius: "var(--radius-lg)", border: "1px solid var(--border)",
        background: "var(--surface-card)",
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "#E8F5E9",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 4, background: "#0F9D58",
            color: "white", fontWeight: 700, fontSize: 14,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>S</span>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Google Sheets — for Career sync</span>
            <span style={{
              padding: "1px 7px", borderRadius: 999, background: "var(--warn-soft)",
              color: "var(--warn)", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
            }}>Re-auth needed</span>
          </div>
          <div className="t-body-sm muted" style={{ marginTop: 3 }}>
            Adds <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>spreadsheets</code> + <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>drive.file</code> scopes to your existing Google connection. Per-file access only — Devy can only read or write sheets it created.
          </div>
        </div>
        <Button variant="primary" size="md" icon="shield-check">Re-authorize Google</Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span className="t-body-sm muted">{totalAccounts} accounts across {providers.length} providers</span>
      </div>
      {providers.map((p) =>
      <IntegrationCard
        key={p.id}
        provider={p}
        accounts={accountsByProvider[p.id]}
        onRemoveAccount={(accId) => removeAccount(p.id, accId)}
        onAddAccount={() => addAccount(p.id)} />

      )}
    </div>);

};

const NotificationsPanel = () => {
  const [channels, setChannels] = useS_s({ push: true, slack: true, email: false, desktop: true });
  const [matrix, setMatrix] = useS_s({
    "PR review": { push: true, slack: true, email: false, desktop: true, sound: false },
    "@mention": { push: true, slack: true, email: false, desktop: true, sound: true },
    "CI failure": { push: true, slack: false, email: true, desktop: true, sound: true },
    "Meeting in 10m": { push: true, slack: false, email: false, desktop: true, sound: true },
    "Ticket comment": { push: false, slack: true, email: false, desktop: false, sound: false },
    "Slack broadcast": { push: false, slack: false, email: false, desktop: false, sound: false }
  });
  const setM = (kind, ch) => setMatrix((m) => ({ ...m, [kind]: { ...m[kind], [ch]: !m[kind][ch] } }));

  return (
    <div>
      <SectionHead title="Notifications" sub="Choose channels, route per event kind, and define quiet hours." />

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Channels</h3>
      <div className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
        {[
        { id: "push", name: "PWA Web Push", desc: "Browser/OS notifications when Devy is installed as a PWA." },
        { id: "slack", name: "Slack self-DM", desc: "Sends a DM to yourself. Threads keep history." },
        { id: "email", name: "Email digest", desc: "Daily summary at 8:00. Requires SMTP or BYO Resend key." },
        { id: "desktop", name: "Desktop banner", desc: "Native macOS/Windows notification while Devy is open." }].
        map((c, idx, arr) =>
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
            <Button variant="ghost" size="sm">Test</Button>
            <Toggle on={channels[c.id]} onChange={(v) => setChannels((s) => ({ ...s, [c.id]: v }))} />
          </Row>
        )}
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Per-event routing</h3>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-soft)" }}>
              <th style={{ textAlign: "left", padding: "10px 14px", fontWeight: 600, color: "var(--muted)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>Event kind</th>
              {["Push", "Slack", "Email", "Desktop", "Sound"].map((c) =>
              <th key={c} style={{ padding: "10px 14px", fontWeight: 600, color: "var(--muted)", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" }}>{c}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix).map(([k, v]) =>
            <tr key={k} style={{ borderTop: "1px solid var(--hairline-soft)" }}>
                <td style={{ padding: "10px 14px", fontWeight: 500 }}>{k}</td>
                {["push", "slack", "email", "desktop", "sound"].map((ch) =>
              <td key={ch} style={{ padding: "8px 14px", textAlign: "center" }}>
                    <button onClick={() => setM(k, ch)} style={{
                  width: 22, height: 22, borderRadius: 5,
                  border: "1px solid " + (v[ch] ? "var(--primary)" : "var(--hairline)"),
                  background: v[ch] ? "var(--primary)" : "var(--canvas)",
                  color: "white", fontSize: 12, cursor: "pointer", padding: 0
                }}>
                      {v[ch] ? "✓" : ""}
                    </button>
                  </td>
              )}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="t-title-md" style={{ margin: "28px 0 10px" }}>Quiet hours</h3>
      <QuietHoursCard />
    </div>);

};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const QuietHoursCard = () => {
  const [enabled, setEnabled] = useS_s(true);
  const [mode, setMode] = useS_s("weekday-weekend"); // "uniform" | "weekday-weekend" | "per-day"
  const [perDay, setPerDay] = useS_s({
    Mon: { on: true, from: "22:00", to: "08:00" },
    Tue: { on: true, from: "22:00", to: "08:00" },
    Wed: { on: true, from: "22:00", to: "08:00" },
    Thu: { on: true, from: "22:00", to: "08:00" },
    Fri: { on: true, from: "22:00", to: "09:00" },
    Sat: { on: true, from: "00:00", to: "23:59" },
    Sun: { on: true, from: "00:00", to: "23:59" },
  });
  const [uniform, setUniform] = useS_s({ from: "22:00", to: "08:00" });
  const [weekday, setWeekday] = useS_s({ from: "22:00", to: "08:00" });
  const [weekend, setWeekend] = useS_s({ on: true, allDay: true, from: "00:00", to: "23:59" });

  const summaryFor = (d, i) => {
    if (mode === "uniform") return enabled ? `${uniform.from}–${uniform.to}` : "off";
    if (mode === "weekday-weekend") {
      if (i < 5) return enabled ? `${weekday.from}–${weekday.to}` : "off";
      return enabled && weekend.on ? (weekend.allDay ? "all day" : `${weekend.from}–${weekend.to}`) : "off";
    }
    const p = perDay[d];
    return enabled && p.on ? `${p.from}–${p.to}` : "off";
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* master toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Toggle on={enabled} onChange={setEnabled} />
        <span style={{ fontSize: 14, fontWeight: 500 }}>Suppress alerts during quiet hours</span>
        <span className="t-mono muted" style={{ fontSize: 11, marginLeft: "auto" }}>queued and delivered at end</span>
      </div>

      {/* schedule mode tabs */}
      <div style={{ display: "inline-flex", background: "var(--surface-soft)", borderRadius: 8, padding: 3, marginBottom: 14, opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}>
        {[
          { id: "uniform", label: "Same every day" },
          { id: "weekday-weekend", label: "Weekday / weekend" },
          { id: "per-day", label: "Per day" },
        ].map((o) => (
          <button key={o.id} onClick={() => setMode(o.id)} style={{
            border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            background: mode === o.id ? "var(--canvas)" : "transparent",
            fontSize: 12, fontWeight: 600,
            color: mode === o.id ? "var(--ink)" : "var(--muted)",
            boxShadow: mode === o.id ? "0 1px 2px rgba(0,0,0,.05)" : "none",
          }}>{o.label}</button>
        ))}
      </div>

      {/* schedule editor */}
      <div style={{ opacity: enabled ? 1 : 0.5, pointerEvents: enabled ? "auto" : "none" }}>
        {mode === "uniform" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-soft)", borderRadius: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: "var(--body)" }}>Every day from</span>
            <TimeField value={uniform.from} onChange={(v) => setUniform((s) => ({ ...s, from: v }))} />
            <span style={{ fontSize: 13, color: "var(--body)" }}>to</span>
            <TimeField value={uniform.to} onChange={(v) => setUniform((s) => ({ ...s, to: v }))} />
            <span className="t-mono muted" style={{ fontSize: 11, marginLeft: "auto" }}>
              {uniform.from > uniform.to ? "overnight" : "same day"}
            </span>
          </div>
        )}

        {mode === "weekday-weekend" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-soft)", borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", width: 96 }}>Mon–Fri</span>
              <span style={{ fontSize: 13, color: "var(--body)" }}>from</span>
              <TimeField value={weekday.from} onChange={(v) => setWeekday((s) => ({ ...s, from: v }))} />
              <span style={{ fontSize: 13, color: "var(--body)" }}>to</span>
              <TimeField value={weekday.to} onChange={(v) => setWeekday((s) => ({ ...s, to: v }))} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--surface-soft)", borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", width: 96 }}>Sat–Sun</span>
              <Toggle on={weekend.on} onChange={(v) => setWeekend((s) => ({ ...s, on: v }))} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                <input type="checkbox" checked={weekend.allDay} onChange={(e) => setWeekend((s) => ({ ...s, allDay: e.target.checked }))} />
                All day
              </label>
              {!weekend.allDay && (
                <>
                  <span style={{ fontSize: 13, color: "var(--body)" }}>from</span>
                  <TimeField value={weekend.from} onChange={(v) => setWeekend((s) => ({ ...s, from: v }))} />
                  <span style={{ fontSize: 13, color: "var(--body)" }}>to</span>
                  <TimeField value={weekend.to} onChange={(v) => setWeekend((s) => ({ ...s, to: v }))} />
                </>
              )}
            </div>
          </div>
        )}

        {mode === "per-day" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {DAY_NAMES.map((d) => {
              const p = perDay[d];
              return (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface-soft)", borderRadius: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", width: 56 }}>{d}</span>
                  <Toggle on={p.on} onChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d], on: v } }))} />
                  <span style={{ fontSize: 13, color: p.on ? "var(--body)" : "var(--muted-soft)" }}>from</span>
                  <TimeField value={p.from} disabled={!p.on} onChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d], from: v } }))} />
                  <span style={{ fontSize: 13, color: p.on ? "var(--body)" : "var(--muted-soft)" }}>to</span>
                  <TimeField value={p.to} disabled={!p.on} onChange={(v) => setPerDay((s) => ({ ...s, [d]: { ...s[d], to: v } }))} />
                  <span className="t-mono muted" style={{ fontSize: 10, marginLeft: "auto" }}>
                    {p.on && p.from > p.to ? "overnight" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* week summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 16 }}>
          {DAY_NAMES.map((d, i) => {
            const summary = summaryFor(d, i);
            const off = summary === "off";
            return (
              <div key={d} style={{
                padding: "8px 0", borderRadius: 8, textAlign: "center",
                background: off ? "var(--surface-strong)" : "var(--ink)",
                color: off ? "var(--muted)" : "white",
                fontSize: 11, fontWeight: 600,
              }}>
                <div>{d}</div>
                <div className="t-mono" style={{ fontSize: 9, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>
                  {summary}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="t-tag muted" style={{ marginBottom: 6 }}>ALLOW THROUGH</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["@mentions", "CI red on prod", "On-call pages"].map((t) =>
          <span key={t} className="chip" style={{ background: "var(--primary-disabled)", color: "var(--primary-active)", fontSize: 12 }}>{t} ×</span>
        )}
        <button className="chip chip-outline" style={{ border: "1px dashed var(--hairline)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>+ Add rule</button>
      </div>
    </div>
  );
};

const TimeField = ({ value, onChange, disabled }) => (
  <input
    type="time"
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    style={{
      fontFamily: "var(--font-mono)", fontSize: 12,
      padding: "6px 10px", borderRadius: 6,
      border: "1px solid var(--hairline)",
      background: disabled ? "var(--surface-strong)" : "var(--canvas)",
      color: disabled ? "var(--muted-soft)" : "var(--ink)",
      outline: "none",
    }}
  />
);

// Tokenized chip — segmented field/op/value for the WHEN clause
const RuleChip = ({ label, value, options, onChange, kind = "value" }) => {
  const colors = {
    field: { bg: "var(--surface-strong)", fg: "var(--ink)" },
    op: { bg: "transparent", fg: "var(--muted)" },
    value: { bg: "var(--primary-disabled)", fg: "var(--primary-active)" }
  }[kind];
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        appearance: "none", border: "none", outline: "none",
        background: colors.bg, color: colors.fg,
        fontFamily: kind === "value" ? "var(--font-mono)" : "var(--font-sans)",
        fontWeight: kind === "field" ? 600 : 500,
        fontSize: 13, padding: kind === "op" ? "4px 4px" : "5px 22px 5px 10px",
        borderRadius: 6, cursor: "pointer"
      }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {kind !== "op" &&
      <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 9, pointerEvents: "none" }}>▾</span>
      }
    </span>);

};

const FIELDS = ["source", "author", "channel", "repo", "title contains", "labels include", "diff size", "is draft"];
const OPS_BY_FIELD = {
  "source": ["is", "is not"],
  "author": ["is", "is not", "matches"],
  "channel": ["is", "is not", "in"],
  "repo": ["is", "is not", "matches"],
  "title contains": ["matches", "doesn't match"],
  "labels include": ["any of", "all of", "none of"],
  "diff size": [">", "<", "="],
  "is draft": ["is true", "is false"]
};
const VALUES_BY_FIELD = {
  "source": ["github", "slack", "calendar", "linear"],
  "author": ["dependabot", "renovate-bot", "@me", "team:platform"],
  "channel": ["#eng-announce", "#incidents", "#deploys", "#random"],
  "repo": ["acme/web", "acme/api", "acme/infra", "acme/*"],
  "title contains": ["prod", "incident", "[WIP]", "lockfile only"],
  "labels include": ["urgent", "blocked", "good-first-issue"],
  "diff size": ["10 lines", "100 lines", "500 lines"],
  "is draft": ["—"]
};
const ACTIONS = [
{ id: "snooze", label: "Snooze", params: ["1 hour", "4 hours", "1 day", "until tomorrow", "until Monday"] },
{ id: "low", label: "Mark as low-prio", params: null },
{ id: "dismiss", label: "Auto-dismiss", params: null },
{ id: "bypass", label: "Bypass quiet hours", params: null },
{ id: "weekly", label: "Add to weekly review", params: null },
{ id: "tag", label: "Add tag", params: ["follow-up", "review", "later", "incident"] },
{ id: "route", label: "Route to", params: ["push", "Slack DM", "email", "desktop"] }];


const RuleBuilder = ({ initial, onSave, onCancel }) => {
  const [matchAll, setMatchAll] = useS_s(initial?.matchAll ?? true);
  const [conds, setConds] = useS_s(initial?.conds ?? [{ field: "source", op: "is", value: "github" }]);
  const [action, setAction] = useS_s(initial?.action ?? "snooze");
  const [actionParam, setActionParam] = useS_s(initial?.actionParam ?? "1 day");

  const updateCond = (i, patch) => setConds((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const addCond = () => setConds((cs) => [...cs, { field: "author", op: "is", value: "dependabot" }]);
  const removeCond = (i) => setConds((cs) => cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs);

  const currentAction = ACTIONS.find((a) => a.id === action);

  return (
    <div style={{ background: "var(--canvas)", border: "1.5px solid var(--primary)", borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span className="t-tag" style={{ color: "var(--primary-active)", letterSpacing: 0.6 }}>NEW RULE</span>
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
              {[["all", true], ["any", false]].map(([l, v]) =>
              <button key={l} onClick={() => setMatchAll(v)} style={{
                border: "none", padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                background: matchAll === v ? "var(--canvas)" : "transparent",
                fontSize: 12, fontWeight: 600,
                color: matchAll === v ? "var(--ink)" : "var(--muted)",
                boxShadow: matchAll === v ? "0 1px 2px rgba(0,0,0,.05)" : "none"
              }}>{l}</button>
              )}
            </div>
            <span style={{ fontSize: 13, color: "var(--body)" }}>of these conditions:</span>
          </div>
          {conds.map((c, i) =>
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 8px", background: "var(--surface-soft)", borderRadius: 8 }}>
              <RuleChip kind="field" value={c.field} options={FIELDS} onChange={(v) => updateCond(i, { field: v, op: OPS_BY_FIELD[v][0], value: VALUES_BY_FIELD[v][0] })} />
              <RuleChip kind="op" value={c.op} options={OPS_BY_FIELD[c.field]} onChange={(v) => updateCond(i, { op: v })} />
              <RuleChip kind="value" value={c.value} options={VALUES_BY_FIELD[c.field]} onChange={(v) => updateCond(i, { value: v })} />
              <span style={{ flex: 1 }} />
              {conds.length > 1 &&
            <button onClick={() => removeCond(i)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
            }
            </div>
          )}
          <button onClick={addCond} style={{
            border: "1px dashed var(--hairline)", background: "transparent",
            padding: "6px 12px", borderRadius: 6, color: "var(--muted)",
            fontSize: 12, fontWeight: 500, cursor: "pointer"
          }}>+ Add condition</button>
        </div>
      </div>

      {/* THEN */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14, paddingTop: 14, borderTop: "1px solid var(--hairline-soft)" }}>
        <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", paddingTop: 8, width: 50 }}>THEN</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--surface-soft)", borderRadius: 8 }}>
          <RuleChip kind="field" value={ACTIONS.find((a) => a.id === action)?.label} options={ACTIONS.map((a) => a.label)} onChange={(v) => {
            const a = ACTIONS.find((x) => x.label === v);
            setAction(a.id);
            setActionParam(a.params?.[0] ?? null);
          }} />
          {currentAction.params &&
          <RuleChip kind="value" value={actionParam} options={currentAction.params} onChange={setActionParam} />
          }
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, paddingTop: 14, borderTop: "1px solid var(--hairline-soft)" }}>
        <span className="t-mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", width: 50 }}>NAME</span>
        <input defaultValue="Auto-snooze dependabot" style={{
          flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--hairline)",
          background: "var(--canvas)", fontSize: 14, outline: "none", color: "var(--ink)"
        }} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="secondary" onClick={onSave}>Test on history</Button>
        <Button variant="primary" onClick={onSave}>Save rule</Button>
      </div>
    </div>);

};

const RulesPanel = () => {
  const [rules, setRules] = useS_s([
  { when: "PR author is dependabot", then: "Snooze 1 day", on: true, hits: 47 },
  { when: "Slack channel is #eng-announce", then: "Mark as low-priority", on: true, hits: 12 },
  { when: "PR has only lockfile changes", then: "Auto-dismiss", on: false, hits: 31 },
  { when: "Mention contains \"prod\" or \"incident\"", then: "Bypass quiet hours", on: true, hits: 4 },
  { when: "Meeting has no agenda", then: "Add to weekly review", on: false, hits: 8 }]
  );
  const [editing, setEditing] = useS_s(false);
  const toggle = (i) => setRules((rs) => rs.map((r, idx) => idx === i ? { ...r, on: !r.on } : r));

  return (
    <div>
      <SectionHead title="Inbox rules" sub="Pure rule evaluator over Signals — runs after upsert, before alert dispatch." />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <span className="t-body-sm muted">{rules.filter((r) => r.on).length} of {rules.length} active · evaluated in order, top-down</span>
        <span style={{ flex: 1 }} />
        {!editing &&
        <Button variant="primary" icon="plus" onClick={() => setEditing(true)}>New rule</Button>
        }
      </div>
      {editing && <RuleBuilder onSave={() => setEditing(false)} onCancel={() => setEditing(false)} />}
      <div className="card" style={{ overflow: "hidden" }}>
        {rules.map((r, i) =>
        <Row key={i} last={i === rules.length - 1}>
            <span className="t-mono muted" style={{ fontSize: 11, fontWeight: 700, width: 24, textAlign: "right" }}>{i + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, flexWrap: "wrap" }}>
              <span className="t-mono" style={{ fontSize: 11, color: "var(--muted)" }}>WHEN</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, background: "var(--surface-soft)", padding: "3px 8px", borderRadius: 4 }}>{r.when}</code>
              <span className="t-mono" style={{ fontSize: 11, color: "var(--muted)" }}>THEN</span>
              <span style={{ fontWeight: 500 }}>{r.then}</span>
              <span className="t-mono muted" style={{ fontSize: 10, marginLeft: "auto", paddingLeft: 12 }}>{r.hits} hits / 30d</span>
            </div>
            <Button variant="ghost" size="sm">Edit</Button>
            <Toggle on={r.on} onChange={() => toggle(i)} />
          </Row>
        )}
      </div>
    </div>);

};

const AI_CATALOG = {
  anthropic: {
    name: "Anthropic",
    models: [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tier: "smartest", cost: "$3 / $15 per Mtok" },
      { id: "claude-opus-4-1",   label: "Claude Opus 4.1",   tier: "best for hard reasoning", cost: "$15 / $75 per Mtok" },
      { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  tier: "fast & cheap", cost: "$1 / $5 per Mtok" },
    ],
  },
  openai: {
    name: "OpenAI",
    models: [
      { id: "gpt-5",       label: "GPT-5",       tier: "smartest", cost: "$5 / $20 per Mtok" },
      { id: "gpt-4o",      label: "GPT-4o",      tier: "balanced", cost: "$2.50 / $10 per Mtok" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "fast & cheap", cost: "$0.15 / $0.60 per Mtok" },
    ],
  },
  google: {
    name: "Google",
    models: [
      { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",   tier: "smartest", cost: "$1.25 / $10 per Mtok" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "fast & cheap", cost: "$0.30 / $2.50 per Mtok" },
    ],
  },
  groq: {
    name: "Groq",
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B", tier: "fast inference", cost: "$0.59 / $0.79 per Mtok" },
      { id: "llama-3.1-8b",  label: "Llama 3.1 8B",  tier: "fastest", cost: "$0.05 / $0.08 per Mtok" },
    ],
  },
};

const ModelSelect = ({ value, onChange, models, mono = true }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={{
    width: "100%", height: 32, padding: "0 12px",
    borderRadius: "var(--radius-md)", border: "1px solid var(--input)",
    background: "var(--background)", fontSize: 13, color: "var(--foreground)", outline: "none",
    cursor: "pointer", fontFamily: mono ? "var(--font-mono)" : "inherit",
  }}>
    {models.map((m) => (
      <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
    ))}
  </select>
);

const AIPanel = () => {
  const [provider, setProvider] = useS_s("anthropic");
  const [primaryModel,  setPrimaryModel]  = useS_s("claude-sonnet-4-5");
  const [fallbackModel, setFallbackModel] = useS_s("claude-haiku-4-5");
  const providers = Object.entries(AI_CATALOG).map(([id, p]) => ({ id, name: p.name, models: p.models }));
  const cat = AI_CATALOG[provider];
  const primaryMeta  = cat.models.find((m) => m.id === primaryModel)  || cat.models[0];
  const fallbackMeta = cat.models.find((m) => m.id === fallbackModel) || cat.models[cat.models.length - 1];

  // when provider changes, reset model selections to that provider's first/last
  React.useEffect(() => {
    if (!cat.models.find((m) => m.id === primaryModel))  setPrimaryModel(cat.models[0].id);
    if (!cat.models.find((m) => m.id === fallbackModel)) setFallbackModel(cat.models[cat.models.length - 1].id);
  }, [provider]);

  return (
    <div>
      <SectionHead title="AI provider" sub="Bring your own key. Devy never stores prompts; spend tracked locally in your Supabase." />

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Provider</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {providers.map((p) =>
        <button key={p.id} onClick={() => setProvider(p.id)} style={{
          padding: "16px 12px", borderRadius: 12, cursor: "pointer", textAlign: "left",
          background: provider === p.id ? "var(--primary-disabled)" : "var(--canvas)",
          border: provider === p.id ? "1.5px solid var(--primary)" : "1px solid var(--hairline)"
        }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
            <div className="t-mono muted" style={{ fontSize: 10 }}>{p.models.length} models</div>
          </button>
        )}
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Models</h3>
      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-tag muted">PRIMARY MODEL</span>
            <ModelSelect value={primaryModel} onChange={setPrimaryModel} models={cat.models} />
            <span className="t-body-sm muted" style={{ fontSize: 11 }}>
              Used for daily briefing, smart routing, and inbox triage. <span className="t-mono">{primaryMeta.cost}</span>
            </span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-tag muted">FALLBACK MODEL</span>
            <ModelSelect value={fallbackModel} onChange={setFallbackModel} models={cat.models} />
            <span className="t-body-sm muted" style={{ fontSize: 11 }}>
              Used after the budget threshold below — and as the auto-retry on rate limits. <span className="t-mono">{fallbackMeta.cost}</span>
            </span>
          </label>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div className="t-tag muted" style={{ marginBottom: 8 }}>API KEY</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
          <input type="password" defaultValue="sk-ant-api03-••••••••••••••••••••••" style={{
            flex: 1, height: 32, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--input)",
            background: "var(--surface-soft)", fontFamily: "var(--font-mono)", fontSize: 13, outline: "none", color: "var(--ink)"
          }} />
          <Button variant="secondary">Validate</Button>
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
          <div style={{ height: "100%", width: "34%", background: "var(--primary)" }} />
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)" }}>
          <span>↓ <b style={{ color: "var(--ink)" }}>Fallback at 80%</b> ($20.00) → <span className="t-mono">{fallbackMeta.label}</span></span>
          <span>· <b style={{ color: "var(--ink)" }}>Hard stop at 100%</b> ($25.00)</span>
        </div>

        {/* Cap + fallback controls */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--hairline-soft)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-tag muted">MONTHLY CAP</span>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>$</span>
              <input type="number" defaultValue="25" min="1" step="1" style={{
                width: "100%", height: 32, padding: "0 12px 0 22px",
                borderRadius: "var(--radius-md)", border: "1px solid var(--input)",
                background: "var(--background)", fontSize: 13, color: "var(--foreground)", outline: "none",
                fontFamily: "var(--font-mono)",
              }} />
            </div>
            <span className="t-body-sm muted" style={{ fontSize: 11 }}>Hard stop when reached. Resets on the 1st of each month.</span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="t-tag muted">FALLBACK THRESHOLD</span>
            <select defaultValue="80" style={{
              width: "100%", height: 32, padding: "0 12px",
              borderRadius: "var(--radius-md)", border: "1px solid var(--input)",
              background: "var(--background)", fontSize: 13, color: "var(--foreground)", outline: "none",
              cursor: "pointer", fontFamily: "var(--font-mono)",
            }}>
              <option value="50">50% — switch early</option>
              <option value="70">70%</option>
              <option value="80">80% — recommended</option>
              <option value="90">90%</option>
              <option value="off">Never (always primary)</option>
            </select>
            <span className="t-body-sm muted" style={{ fontSize: 11 }}>Switches <span className="t-mono">{primaryMeta.label}</span> → <span className="t-mono">{fallbackMeta.label}</span> at this percentage.</span>
          </label>
        </div>
      </div>

      <h3 className="t-title-md" style={{ margin: "0 0 10px" }}>Privacy</h3>
      <div className="card" style={{ overflow: "hidden" }}>
        {[
        { name: "Strip code blocks", desc: "Removes ``` fenced blocks before sending." },
        { name: "Strip file paths", desc: "Replaces /src/foo/bar.ts with [path]." },
        { name: "Strip secrets", desc: "Pattern match: API keys, JWTs, env vars." },
        { name: "Strip PR diffs", desc: "Drops + / − lines entirely." },
        { name: "Disable AI on personal account", desc: "No outbound LLM calls when this profile is active." }].
        map((r, i, arr) =>
        <Row key={i} last={i === arr.length - 1}>
            <span style={{ width: 22 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
              <div className="t-body-sm muted" style={{ marginTop: 2 }}>{r.desc}</div>
            </div>
            <span />
            <Toggle on={i < 3} onChange={() => {}} />
          </Row>
        )}
      </div>
    </div>);

};

const SelfHostPanel = () =>
<div>
    <SectionHead title="Self-host" sub="Your deployment. All data and tokens live in your own Supabase + Cloudflare Worker." />
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {[
    ["Deployment URL", "https://devy.kovacs.dev"],
    ["Worker version", "v0.41.2 · deployed 3d ago"],
    ["Supabase project", "dyy-prod-zef.supabase.co"],
    ["Allowed email", "erin@kovacs.dev"],
    ["Auth proxy", "auth.devy.dev (shared, stateless)"]].
    map(([k, v], i, arr) =>
    <Row key={k} last={i === arr.length - 1}>
          <span style={{ width: 0 }} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{k}</span>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)" }}>{v}</code>
          <Button variant="ghost" size="sm">Copy</Button>
        </Row>
    )}
    </div>
    <h3 className="t-title-md" style={{ margin: "28px 0 10px" }}>Data</h3>
    <div className="card" style={{ padding: 18, display: "flex", gap: 10 }}>
      <Button variant="secondary">Export my data (JSON)</Button>
      <Button variant="secondary">Run signal-rollup now</Button>
      <span style={{ flex: 1 }} />
      <span className="t-mono muted" style={{ fontSize: 11, alignSelf: "center" }}>1,847 raw signals · 12 rollups · 90-day retention</span>
    </div>
    <h3 className="t-title-md" style={{ margin: "28px 0 10px", color: "var(--danger)" }}>Danger zone</h3>
    <div className="card" style={{ padding: 18, borderColor: "var(--danger-soft)" }}>
      <Button variant="secondary" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>Disconnect all providers</Button>
    </div>
  </div>;


const ProfilePanel = () =>
<div>
    <SectionHead title="Profile" sub="Used for greeting, AI context, and the avatar." />
    <div className="card" style={{ padding: 22, display: "flex", gap: 18, alignItems: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #ffd1da, #ff385c)", color: "white", fontSize: 24, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>EK</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Erin Kovacs</div>
        <div className="t-body-sm muted">erin@kovacs.dev · GitHub @erinkov</div>
      </div>
      <Button variant="secondary">Sign out</Button>
    </div>
  </div>;


window.SettingsPage = SettingsPage;