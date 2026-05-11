// Tasks page

const TasksPage = () => {
  const tickets = [
  { id: "DEV-441", title: "Add timestamp-replay rejection to slack-webhook", p: "P1", status: "in_progress", days: 1, pr: "#421", labels: ["security"] },
  { id: "DEV-447", title: "Cron orchestrator: idempotent retry tick", p: "P2", status: "in_progress", days: 3, pr: null, labels: ["infra"] },
  { id: "DEV-401", title: "Signal-store upsert benchmarks", p: "P3", status: "in_progress", days: 6, pr: "#410", labels: ["perf"] },
  { id: "DEV-432", title: "Privacy redactor patterns", p: "P2", status: "todo", days: 0, pr: null, labels: ["ai"] },
  { id: "DEV-455", title: "Settings shell: AI provider sub-page", p: "P2", status: "todo", days: 0, pr: null, labels: ["frontend"] },
  { id: "DEV-460", title: "Web-push VAPID key rotation flow", p: "P3", status: "todo", days: 0, pr: null, labels: ["alerts"] },
  { id: "DEV-388", title: "Onboarding: Slack-channel allowlist step", p: "P2", status: "review", days: 1, pr: "#398", labels: ["onboarding"] },
  { id: "DEV-378", title: "Calendar adapter: dedupe by event_id", p: "P3", status: "review", days: 2, pr: "#392", labels: ["sync"] },
  { id: "DEV-360", title: "Auth-proxy state token TTL audit", p: "P1", status: "done", days: 4, pr: "#372", labels: ["security"] }];


  const cols = [
  { id: "todo", label: "To do", tone: "var(--muted)" },
  { id: "in_progress", label: "In progress", tone: "var(--primary)" },
  { id: "review", label: "In review", tone: "var(--warn)" },
  { id: "done", label: "Done this week", tone: "var(--good)" }];


  return (
    <div style={{ padding: "28px 36px 48px", maxWidth: 1500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 18 }}>
        <h1 className="t-display-xl" style={{ margin: 0, letterSpacing: -0.6 }}>Tasks</h1>
        <span className="t-body muted" style={{ marginLeft: 14 }}>9 assigned to you · Linear · Sprint 24</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {cols.map((c) => {
          const items = tickets.filter((t) => t.status === c.id);
          return (
            <div key={c.id} className="card" style={{ padding: "14px 12px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px 10px", borderBottom: "1px solid var(--hairline-soft)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c.tone }} />
                <span className="t-title-sm">{c.label}</span>
                <span className="t-mono muted" style={{ fontSize: 11, marginLeft: "auto" }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10 }}>
                {items.map((t) =>
                <div key={t.id} style={{
                  padding: "10px 12px", border: "1px solid var(--hairline-soft)", borderRadius: 10,
                  background: "var(--canvas)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span className="t-mono" style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{t.id}</span>
                      <span className="chip" style={{
                      fontSize: 9, padding: "1px 6px",
                      background: t.p === "P1" ? "var(--danger-soft)" : t.p === "P2" ? "var(--warn-soft)" : "var(--surface-strong)",
                      color: t.p === "P1" ? "var(--danger)" : t.p === "P2" ? "var(--warn)" : "var(--muted)"
                    }}>{t.p}</span>
                      {t.pr && <span className="t-mono muted" style={{ fontSize: 10, marginLeft: "auto" }}>PR {t.pr}</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "var(--ink)", marginBottom: 6 }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.labels.map((l) =>
                    <span key={l} className="t-mono" style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)", background: "var(--surface-soft)", padding: "1px 6px", borderRadius: 4 }}>{l}</span>
                    )}
                      {t.days > 0 && <span className="t-mono muted" style={{ fontSize: 9, marginLeft: "auto" }}>{t.days}d</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>);

        })}
      </div>
    </div>);

};

window.TasksPage = TasksPage;