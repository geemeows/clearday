// Automations panel — Settings → Automations
// Replaces the old Inbox Rules tab. Implements list + builder + runs + dry-run + live preview.

const { useState: useS_a, useMemo: useMemo_a, useEffect: useE_a } = React;

// ---------------- Fixture data ----------------

const TRIGGER_KINDS = [
  { id: "signal_ingested", label: "Signal ingested", desc: "Fires when a new Signal lands in the inbox" },
  { id: "signal_state_change", label: "Signal state changed", desc: "Fires when a Signal updates (commits, merge, reaction)" },
  { id: "focus_started", label: "Focus session started", desc: "Fires when you start a Focus block" },
  { id: "focus_ended", label: "Focus session ended", desc: "Fires when a Focus session ends" },
  { id: "schedule", label: "Schedule", desc: "Cron-like — fires every weekday at 9am, etc." },
];

const ACTION_KINDS = [
  { id: "slack_post_message", group: "Slack", label: "Post Slack message", desc: "Channel, self-DM, or thread reply", cap: true },
  { id: "github_comment", group: "GitHub", label: "Comment on PR", desc: "Adds a PR review comment", cap: true },
  { id: "github_request_reviewers", group: "GitHub", label: "Request reviewers", desc: "Re-request review from named users", cap: true },
  { id: "set_focus", group: "Focus", label: "Start a Focus session", desc: "Begin a Focus block of N minutes", cap: true },
  { id: "tag", group: "Internal", label: "Tag the Signal", desc: "Apply tags for inbox filtering", cap: true },
  { id: "snooze", group: "Internal", label: "Snooze the Signal", desc: "Hide until a relative time", cap: true },
  { id: "set_priority", group: "Internal", label: "Set Signal priority", desc: "Bump or lower priority", cap: true },
  { id: "dismiss", group: "Internal", label: "Dismiss the Signal", desc: "Mark as handled", cap: true },
  { id: "transition_ticket", group: "Tickets", label: "Transition ticket status", desc: "Move a Linear/Jira ticket — capability not yet wired", cap: false },
];

const FIXTURE_AUTOMATIONS = [
  {
    id: "a1",
    name: "Post my PRs to #reviews",
    enabled: true,
    dryRun: false,
    priority: 10,
    trigger: { kind: "signal_ingested" },
    predicates: [
      { field: "signal.source", op: "equals", value: "github" },
      { field: "signal.kind", op: "equals", value: "pr_review_requested" },
      { field: "signal.payload.author", op: "equals", value: "erinkov" },
    ],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "channel",
          channel: "#reviews",
          body: "📋 New PR up for review\n*{{signal.title}}*\n{{signal.url}}\nLinked ticket: {{signal.payload.ticket}}",
        },
      },
    ],
    stats: { lastRunAt: "2026-05-07T09:42:00Z", lastStatus: "succeeded", totalRuns: 47, fail7d: 0 },
  },
  {
    id: "a2",
    name: "Re-ping reviewers on PR updates",
    enabled: true,
    dryRun: false,
    priority: 20,
    trigger: { kind: "signal_state_change", watchFields: ["payload.commits_after_review"] },
    predicates: [
      { field: "signal.kind", op: "equals", value: "pr_opened" },
      { field: "signal.author_is_me", op: "is_true", value: true },
      { field: "transition.field", op: "equals", value: "payload.commits_after_review" },
    ],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "thread_reply",
          body: "Pushed a new commit addressing review feedback. {{signal.payload.reviewers_at}} mind taking another pass? 🙏",
        },
      },
    ],
    stats: { lastRunAt: "2026-05-07T08:14:00Z", lastStatus: "succeeded", totalRuns: 18, fail7d: 0 },
  },
  {
    id: "a3",
    name: "Focus auto-reply",
    enabled: true,
    dryRun: false,
    priority: 5,
    trigger: { kind: "signal_ingested" },
    predicates: [
      { field: "signal.source", op: "equals", value: "slack" },
      { field: "signal.is_focus_match", op: "is_true", value: true },
      { field: "context.focus.active", op: "equals", value: "true" },
    ],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "thread_reply",
          body: "Hey — I'm in a Focus block until {{context.focus.ends_at}} ⏳\n\nReact with 🚨 if this is genuinely urgent and I'll be paged immediately. Otherwise I'll reply when I'm out.",
          softIdempotencyKey: "focus_session_id:slack_thread_ts",
        },
      },
    ],
    stats: { lastRunAt: "2026-05-07T07:55:00Z", lastStatus: "succeeded", totalRuns: 32, fail7d: 1 },
  },
  {
    id: "a4",
    name: "Back-online summary",
    enabled: true,
    dryRun: false,
    priority: 15,
    trigger: { kind: "focus_ended" },
    predicates: [],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "self_dm",
          body: "👋 Back online — Focus block was {{focus.duration_min}}m. Threads I auto-replied to:\n{{focus.replied_threads}}",
        },
      },
    ],
    stats: { lastRunAt: "2026-05-06T17:30:00Z", lastStatus: "succeeded", totalRuns: 12, fail7d: 0 },
  },
  {
    id: "a5",
    name: "Mark merged: tag + dismiss",
    enabled: true,
    dryRun: false,
    priority: 30,
    trigger: { kind: "signal_state_change", watchFields: ["payload.merged"] },
    predicates: [
      { field: "signal.author_is_me", op: "is_true", value: true },
      { field: "transition.to", op: "equals", value: "merged" },
    ],
    actions: [
      { kind: "tag", config: { tags: ["shipped"] } },
      { kind: "dismiss", config: {} },
      { kind: "transition_ticket", config: { to: "Done" } },
    ],
    stats: { lastRunAt: "2026-05-06T16:11:00Z", lastStatus: "partial", totalRuns: 9, fail7d: 0, deferred: 1 },
  },
  {
    id: "a6",
    name: "Daily 9am — yesterday's merged PRs",
    enabled: false,
    dryRun: true,
    priority: 50,
    trigger: { kind: "schedule", cron: "0 9 * * 1-5", cronLabel: "Weekdays · 9:00" },
    predicates: [],
    actions: [
      {
        kind: "slack_post_message",
        config: {
          target: "self_dm",
          body: "Yesterday's merged PRs:\n{{schedule.merged_prs_summary}}",
        },
      },
    ],
    stats: { lastRunAt: "2026-05-07T09:00:00Z", lastStatus: "skipped_dry_run", totalRuns: 4, fail7d: 0 },
  },
];

const FIXTURE_RUNS = {
  a1: [
    { ts: "2026-05-07T09:42:00Z", status: "succeeded", trigger: "signal:s_4471", actions: [{ kind: "slack_post_message", ref: "channel #reviews · ts 1715071320" }] },
    { ts: "2026-05-07T08:11:00Z", status: "succeeded", trigger: "signal:s_4467", actions: [{ kind: "slack_post_message", ref: "channel #reviews · ts 1715065860" }] },
    { ts: "2026-05-06T19:01:00Z", status: "skipped_idempotent", trigger: "signal:s_4467", actions: [] },
    { ts: "2026-05-06T16:24:00Z", status: "succeeded", trigger: "signal:s_4459", actions: [{ kind: "slack_post_message", ref: "channel #reviews · ts 1714999440" }] },
    { ts: "2026-05-06T11:09:00Z", status: "succeeded", trigger: "signal:s_4452", actions: [{ kind: "slack_post_message", ref: "channel #reviews · ts 1714980540" }] },
  ],
  a3: [
    { ts: "2026-05-07T07:55:00Z", status: "succeeded", trigger: "signal:s_4470", actions: [{ kind: "slack_post_message", ref: "thread D03KQ.1715062500" }] },
    { ts: "2026-05-07T07:48:00Z", status: "skipped_idempotent", trigger: "signal:s_4469", actions: [] },
    { ts: "2026-05-07T07:42:00Z", status: "succeeded", trigger: "signal:s_4468", actions: [{ kind: "slack_post_message", ref: "thread D03KQ.1715061720" }] },
    { ts: "2026-05-07T07:38:00Z", status: "failed", trigger: "signal:s_4466", actions: [], error: "Slack API: channel_not_found (rotated channel id)" },
  ],
};

const PREVIEW_SIGNALS = [
  { id: "s_4471", source: "github", kind: "pr_authored", title: "feat: cap retry budget at 3 with jitter", repo: "platform/api", num: "#1284", author: "erinkov", payload: { ticket: "DEV-441" } },
  { id: "s_4467", source: "github", kind: "pr_authored", title: "fix: replay rejection in slack-webhook", repo: "platform/edge", num: "#412", author: "erinkov", payload: { ticket: "DEV-388" } },
  { id: "s_4470", source: "slack", kind: "slack_dm", title: "Quick Q on the auth-proxy refactor", channel: "@priya", payload: {} },
  { id: "s_4459", source: "github", kind: "pr_review_requested", title: "Review request: refactor cron orchestrator", repo: "platform/api", num: "#1280", author: "kalia", payload: {} },
  { id: "s_4452", source: "slack", kind: "slack_mention", title: "@erin — can you eyeball #incidents?", channel: "#incidents", payload: {} },
  { id: "s_4444", source: "linear", kind: "ticket_assigned", title: "DEV-447: cron orchestrator idempotency", payload: {} },
];

// ---------------- Helpers ----------------

const relTime = (iso) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  return d + "d ago";
};

const triggerLabel = (t) => TRIGGER_KINDS.find(k => k.id === t.kind)?.label || t.kind;
const actionLabel = (k) => ACTION_KINDS.find(a => a.id === k)?.label || k;
const actionMeta = (k) => ACTION_KINDS.find(a => a.id === k);

const StatusDot = ({ status }) => {
  const map = {
    succeeded: { c: "var(--good)", t: "ok" },
    failed: { c: "var(--danger)", t: "fail" },
    skipped_idempotent: { c: "var(--muted-soft)", t: "dedupe" },
    skipped_dry_run: { c: "var(--warn)", t: "dry" },
    partial: { c: "var(--warn)", t: "partial" },
    pending: { c: "var(--muted)", t: "pending" },
  };
  const m = map[status] || map.pending;
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.c, display: "inline-block" }} title={m.t} />;
};

// ---------------- Main panel ----------------

const AutomationsPanel = () => {
  const [items, setItems] = useS_a(FIXTURE_AUTOMATIONS);
  const [selectedId, setSelectedId] = useS_a("a1");
  const [mode, setMode] = useS_a("list"); // 'list' | 'detail' | 'builder' | 'runs'
  const [builderStyle, setBuilderStyle] = useS_a("sections"); // 'sections' | 'sentence'
  const [filter, setFilter] = useS_a("");
  const [showEmpty, setShowEmpty] = useS_a(false);

  const visible = items.filter(a => !filter || a.name.toLowerCase().includes(filter.toLowerCase()));
  const selected = items.find(a => a.id === selectedId) || items[0];

  const updateSelected = (patch) => {
    setItems(items.map(a => a.id === selectedId ? { ...a, ...patch } : a));
  };

  const list = showEmpty ? [] : visible;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {mode === "list" && <>
        <SectionHead title="Automations" sub="When something happens, do something. Spans GitHub, Slack, Calendar, and Focus." />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="t-mono muted" style={{ fontSize: 11 }}>{items.filter(a => a.enabled).length} active · {items.filter(a => !a.enabled).length} paused · {items.filter(a => a.dryRun).length} dry-run</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={() => setShowEmpty(e => !e)}>{showEmpty ? "← Restore" : "Empty state"}</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => { setMode("builder"); setSelectedId("__new__"); }}>New automation</Button>
        </div>
      </>}
      {mode !== "list" && (
        <Breadcrumb crumbs={[
          { label: "Automations", onClick: () => setMode("list") },
          { label: mode === "builder" ? (selectedId === "__new__" ? "New" : selected?.name) : selected?.name },
          ...(mode === "runs" ? [{ label: "Runs" }] : []),
        ]} />
      )}

      {/* Single-pane navigation: list, detail, builder, or runs — never side-by-side */}
      {list.length === 0 && mode === "list" ? <EmptyState onCreate={() => { setShowEmpty(false); setMode("builder"); setSelectedId("__new__"); }} /> :
       mode === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter automations…" icon="search" style={{ maxWidth: 360 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {list.map(a =>
              <AutomationListCard key={a.id} a={a}
                onClick={() => { setSelectedId(a.id); setMode("detail"); }}
                onToggle={() => setItems(items.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x))}
              />
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--hairline-soft)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 600 }}>
          {mode === "builder" ? (
            <AutomationBuilder
              key={selectedId}
              automation={selectedId === "__new__" ? makeBlankAutomation() : selected}
              isNew={selectedId === "__new__"}
              onSave={(next) => {
                if (selectedId === "__new__") {
                  const id = "a" + Date.now();
                  setItems([...items, { ...next, id, stats: { lastRunAt: null, lastStatus: null, totalRuns: 0, fail7d: 0 } }]);
                  setSelectedId(id);
                } else {
                  setItems(items.map(x => x.id === selectedId ? { ...x, ...next } : x));
                }
                setMode("detail");
              }}
              onCancel={() => setMode(selectedId === "__new__" ? "list" : "detail")}
            />
          ) : mode === "runs" ? (
            <RunsView automation={selected} onBack={() => setMode("detail")} />
          ) : (
            <AutomationDetail
              onBack={() => setMode("list")}
                automation={selected}
                onEdit={() => setMode("builder")}
                onShowRuns={() => setMode("runs")}
                onUpdate={updateSelected}
                onDelete={() => {
                  const next = items.filter(x => x.id !== selectedId);
                  setItems(next);
                  setSelectedId(next[0]?.id || null);
                }}
              />
            )}
        </div>
      )}
    </div>
  );
};

const makeBlankAutomation = () => ({
  id: "__new__",
  name: "Untitled automation",
  enabled: false,
  dryRun: true,
  priority: 100,
  trigger: { kind: "signal_ingested" },
  predicates: [],
  actions: [],
});

// ---------------- List card ----------------

const AutomationListCard = ({ a, onClick, onToggle }) => {
  const failed = a.stats.lastStatus === "failed";
  const deferred = a.actions.some(act => !actionMeta(act.kind)?.cap);
  return (
    <div onClick={onClick} style={{
      padding: "14px 16px", borderRadius: 10, cursor: "pointer",
      background: "var(--surface-card)",
      border: "1px solid var(--hairline-soft)",
      display: "flex", flexDirection: "column", gap: 8, opacity: a.enabled ? 1 : 0.7,
      transition: "border-color .15s, background .15s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--primary)"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "var(--hairline-soft)"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StatusDot status={failed ? "failed" : a.dryRun ? "skipped_dry_run" : "succeeded"} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {a.name}
        </span>
        <span onClick={e => e.stopPropagation()}><Toggle on={a.enabled} onChange={onToggle} /></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="chip" style={{ fontSize: 9.5, padding: "1px 6px", background: "var(--surface-strong)", color: "var(--muted)", letterSpacing: 0.3 }}>
          {triggerLabel(a.trigger).toUpperCase()}
        </span>
        <span className="t-mono muted" style={{ fontSize: 10 }}>→</span>
        <span className="t-mono" style={{ fontSize: 10.5, color: "var(--ink)" }}>
          {a.actions.length === 1 ? actionLabel(a.actions[0].kind) : `${a.actions.length} actions`}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--muted)" }}>
        <span>{a.stats.totalRuns} runs · last {relTime(a.stats.lastRunAt)}</span>
        <span style={{ flex: 1 }} />
        {a.dryRun && <span className="chip" style={{ fontSize: 9, padding: "0 5px", background: "var(--warn-soft)", color: "var(--warn)", letterSpacing: 0.4 }}>DRY-RUN</span>}
        {deferred && <span className="chip" style={{ fontSize: 9, padding: "0 5px", background: "var(--surface-strong)", color: "var(--muted)", letterSpacing: 0.4 }} title="Includes a not-yet-wired capability">DEFERRED</span>}
        {failed && <span className="chip" style={{ fontSize: 9, padding: "0 5px", background: "var(--danger-soft)", color: "var(--danger)", letterSpacing: 0.4 }}>FAIL</span>}
      </div>
    </div>
  );
};

// ---------------- Detail (read view) ----------------

const AutomationDetail = ({ automation: a, onBack, onEdit, onShowRuns, onUpdate, onDelete }) => {
  const recent = (FIXTURE_RUNS[a.id] || []).slice(0, 5);
  const deferred = a.actions.some(act => !actionMeta(act.kind)?.cap);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header strip */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot status={a.stats.lastStatus} />
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{a.name}</h3>
          {!a.enabled && <span className="chip" style={{ fontSize: 9.5, padding: "1px 7px", background: "var(--surface-strong)", color: "var(--muted)", letterSpacing: 0.4 }}>PAUSED</span>}
          {a.dryRun && <span className="chip" style={{ fontSize: 9.5, padding: "1px 7px", background: "var(--warn-soft)", color: "var(--warn)", letterSpacing: 0.4 }}>DRY-RUN</span>}
        </div>
        <Toggle on={a.enabled} onChange={(v) => onUpdate({ enabled: v })} />
        <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
        <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this automation? Its run history will be purged.")) onDelete(); }} style={{ color: "var(--danger)" }}>Delete</Button>
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Sentence summary */}
        <SentenceSummary a={a} />

        {/* Deferred warning */}
        {deferred && <DeferredBanner />}

        {/* Trigger detail */}
        <div>
          <DetailLabel>WHEN</DetailLabel>
          <TriggerSummary trigger={a.trigger} />
        </div>

        {/* Predicates detail */}
        {a.predicates.length > 0 && (
          <div>
            <DetailLabel>IF</DetailLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--body)" }}>
              {a.predicates.map((p, i) => <PredicateLine key={i} p={p} index={i} />)}
            </div>
          </div>
        )}

        {/* Actions detail */}
        <div>
          <DetailLabel>THEN</DetailLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {a.actions.map((act, i) => <ActionPreviewCard key={i} action={act} index={i} />)}
          </div>
        </div>

        {/* Recent runs */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
            <DetailLabel inline>RECENT RUNS</DetailLabel>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={onShowRuns}>Full history →</Button>
          </div>
          {recent.length > 0 ? (
            <div style={{ border: "1px solid var(--hairline-soft)", borderRadius: 8, overflow: "hidden" }}>
              {recent.map((r, i) => <RunRow key={i} r={r} last={i === recent.length - 1} />)}
            </div>
          ) : (
            <div style={{ padding: "16px 12px", border: "1px dashed var(--hairline)", borderRadius: 8, fontSize: 12, color: "var(--muted-soft)", textAlign: "center" }}>
              Hasn't fired yet. Live preview below shows what would match.
            </div>
          )}
        </div>

        {/* Live preview pane */}
        <div>
          <DetailLabel>LIVE PREVIEW</DetailLabel>
          <LivePreview automation={a} />
        </div>

        {/* Bottom row — dry-run toggle only */}
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="t-body-sm muted">{a.stats.totalRuns} total runs · last fired {relTime(a.stats.lastRunAt)} · priority {a.priority}</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={() => onUpdate({ dryRun: !a.dryRun })}>
            {a.dryRun ? "Exit dry-run" : "Switch to dry-run"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const Breadcrumb = ({ crumbs }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
    {crumbs.map((c, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span style={{ color: "var(--muted-soft)" }}>/</span>}
        {c.onClick ? (
          <button onClick={c.onClick} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "var(--primary)", fontSize: 13, fontWeight: 500 }}>{c.label}</button>
        ) : (
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{c.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

const DetailLabel = ({ children, inline }) => (
  <div className="t-tag muted" style={{ letterSpacing: 0.6, fontSize: 10, marginBottom: inline ? 0 : 8 }}>{children}</div>
);

const SentenceSummary = ({ a }) => {
  return (
    <div style={{
      padding: "14px 16px", background: "var(--surface-soft)", borderRadius: 10,
      fontSize: 14, lineHeight: 1.6, color: "var(--body)", fontWeight: 400,
    }}>
      <span style={{ color: "var(--muted)" }}>WHEN</span>{" "}
      <Pill>{triggerLabel(a.trigger)}</Pill>
      {a.trigger.kind === "schedule" && <> {" "}<Pill mono>{a.trigger.cron}</Pill></>}
      {a.predicates.length > 0 && (
        <> {" "}<span style={{ color: "var(--muted)" }}>IF</span>{" "}
          {a.predicates.map((p, i) => (
            <span key={i}>
              <Pill mono>{formatPredicate(p)}</Pill>
              {i < a.predicates.length - 1 && <span style={{ color: "var(--muted)" }}> AND </span>}
            </span>
          ))}
        </>
      )}
      {" "}<span style={{ color: "var(--muted)" }}>THEN</span>{" "}
      {a.actions.map((act, i) => (
        <span key={i}>
          <Pill accent={!!actionMeta(act.kind)?.cap} disabled={!actionMeta(act.kind)?.cap}>{actionLabel(act.kind)}</Pill>
          {i < a.actions.length - 1 && <span style={{ color: "var(--muted)" }}> + </span>}
        </span>
      ))}
    </div>
  );
};

const Pill = ({ children, mono, accent, disabled }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6,
    background: disabled ? "var(--surface-strong)" : accent ? "var(--primary-disabled)" : "var(--canvas)",
    color: disabled ? "var(--muted)" : accent ? "var(--primary-active)" : "var(--ink)",
    fontFamily: mono ? "var(--font-mono)" : "inherit",
    fontSize: mono ? 11.5 : 12.5, fontWeight: 600,
    border: "1px solid var(--hairline-soft)",
    textDecoration: disabled ? "line-through" : "none",
    margin: "1px 1px",
  }}>{children}</span>
);

const TriggerSummary = ({ trigger }) => {
  const meta = TRIGGER_KINDS.find(k => k.id === trigger.kind);
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--hairline-soft)", borderRadius: 8, background: "var(--canvas)", display: "flex", alignItems: "center", gap: 10 }}>
      <TriggerIcon kind={trigger.kind} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{meta?.label}</div>
        <div className="t-mono muted" style={{ fontSize: 11, marginTop: 2 }}>
          {trigger.kind === "schedule" ? `${trigger.cronLabel} · ${trigger.cron}` :
           trigger.kind === "signal_state_change" ? `watches: ${(trigger.watchFields || []).join(", ")}` :
           meta?.desc}
        </div>
      </div>
    </div>
  );
};

const TriggerIcon = ({ kind }) => {
  const ICON_MAP = {
    signal_ingested: "inbox",
    signal_state_change: "activity",
    focus_started: "target",
    focus_ended: "check-circle",
    schedule: "clock",
  };
  return <span style={{ display: "inline-flex", color: "var(--foreground)", flexShrink: 0 }}><Icon name={ICON_MAP[kind] || ICON_MAP.signal_ingested} size={14} /></span>;
};

const formatPredicate = (p) => {
  const lbl = (p.field.split(".").pop() || p.field).replace(/_/g, " ");
  const op = opLabel[p.op] || p.op;
  if (p.op === "is_true" || p.op === "is_false") return `${lbl} ${op}`;
  const val = Array.isArray(p.value) ? p.value.join(", ") : String(p.value);
  return `${lbl} ${op} ${val}`;
};

const PredicateLine = ({ p, index }) => {
  const showVal = p.op !== "is_true" && p.op !== "is_false";
  const valStr = Array.isArray(p.value) ? p.value.join(", ") : String(p.value);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ color: "var(--muted-soft)", fontSize: 10, width: 22 }}>{index === 0 ? "IF" : "AND"}</span>
      <code style={{ background: "var(--surface-soft)", padding: "3px 8px", borderRadius: 4, color: "var(--ink)" }}>{p.field}</code>
      <span style={{ color: "var(--muted)" }}>{opLabel[p.op] || p.op}</span>
      {showVal && <code style={{ background: "var(--primary-disabled)", padding: "3px 8px", borderRadius: 4, color: "var(--primary-active)" }}>{valStr}</code>}
    </div>
  );
};

const ActionPreviewCard = ({ action, index }) => {
  const meta = actionMeta(action.kind);
  const deferred = !meta?.cap;
  return (
    <div style={{ padding: "12px 14px", border: deferred ? "1px solid var(--warn-soft)" : "1px solid var(--hairline-soft)", borderRadius: 8, background: deferred ? "var(--warn-soft)" : "var(--canvas)", opacity: deferred ? 0.85 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: action.config.body || action.config.tags ? 6 : 0 }}>
        <span style={{ width: 18, height: 18, borderRadius: 999, background: deferred ? "var(--warn)" : "var(--primary)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{index + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{meta?.label}</span>
        <span className="t-mono muted" style={{ fontSize: 10 }}>{meta?.group}</span>
        {deferred && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--warn)", color: "white", letterSpacing: 0.4, marginLeft: "auto" }}>NOT WIRED</span>}
        {action.config.target === "thread_reply" && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--surface-strong)", color: "var(--muted)", letterSpacing: 0.4, marginLeft: deferred ? 0 : "auto" }}>THREAD REPLY</span>}
        {action.config.target === "self_dm" && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--surface-strong)", color: "var(--muted)", letterSpacing: 0.4, marginLeft: "auto" }}>SELF-DM</span>}
        {action.config.target === "channel" && <span className="t-mono muted" style={{ fontSize: 10.5, marginLeft: "auto" }}>{action.config.channel}</span>}
      </div>
      {action.config.body && (
        <div style={{ background: "var(--surface-soft)", padding: "8px 10px", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--body)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {renderTemplate(action.config.body)}
        </div>
      )}
      {action.config.tags && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {action.config.tags.map((t) => <span key={t} className="chip" style={{ fontSize: 10, padding: "2px 8px", background: "var(--surface-strong)", color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{t}</span>)}
        </div>
      )}
      {action.config.softIdempotencyKey && (
        <div className="t-mono muted" style={{ fontSize: 10, marginTop: 6 }}>
          ⓘ soft idempotency: {action.config.softIdempotencyKey}
        </div>
      )}
    </div>
  );
};

// Highlight {{...}} templating in body text
const renderTemplate = (text) => {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => p.startsWith("{{") ? (
    <span key={i} style={{ background: "var(--primary-disabled)", color: "var(--primary-active)", padding: "0 3px", borderRadius: 3, fontWeight: 600 }}>{p}</span>
  ) : <span key={i}>{p}</span>);
};

const DeferredBanner = () => (
  <div style={{ padding: "10px 14px", background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
    <Icon name="alert-triangle" size={16} style={{ color: "var(--warn)" }} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--warn)" }}>Includes a not-yet-wired action</div>
      <div className="t-body-sm" style={{ color: "var(--body)", marginTop: 1 }}>This automation will plan correctly, but the <b>Transition ticket</b> step will be a no-op until the Linear/Jira capability lands.</div>
    </div>
  </div>
);

const RunRow = ({ r, last }) => (
  <div style={{
    display: "grid", gridTemplateColumns: "auto 100px 1fr auto", gap: 12, alignItems: "center",
    padding: "8px 12px", borderBottom: last ? "none" : "1px solid var(--hairline-soft)",
    background: r.status === "failed" ? "var(--danger-soft)" : "transparent",
  }}>
    <StatusDot status={r.status} />
    <span className="t-mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{relTime(r.ts)}</span>
    <div style={{ minWidth: 0 }}>
      <div className="t-mono" style={{ fontSize: 10.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {r.trigger}{r.actions[0] ? ` → ${r.actions[0].ref}` : ""}
      </div>
      {r.error && <div style={{ fontSize: 10.5, color: "var(--danger)", marginTop: 2 }}>{r.error}</div>}
    </div>
    <span className="t-mono muted" style={{ fontSize: 9.5 }}>{r.status.replace("_", " ")}</span>
  </div>
);

// ---------------- Live preview ----------------

const LivePreview = ({ automation }) => {
  // Naive predicate matcher for fixture purposes
  const matches = useMemo_a(() => PREVIEW_SIGNALS.map(s => {
    const matchResults = automation.predicates.map(p => {
      const fieldVal = (() => {
        if (p.field === "signal.source") return s.source;
        if (p.field === "signal.kind") return s.kind;
        if (p.field === "signal.payload.author") return s.payload.author;
        if (p.field === "signal.payload.has_review_comments") return "true";
        if (p.field === "transition.field") return "payload.commits_after_review";
        if (p.field === "transition.to") return "merged";
        if (p.field === "context.focus.active") return "true";
        return "";
      })();
      const ok = p.op === "in" ?
        p.value.split(",").map(v => v.trim()).includes(fieldVal) :
        fieldVal === p.value;
      return ok;
    });
    return { signal: s, matched: matchResults.every(Boolean), checks: matchResults };
  }), [automation.predicates]);

  const matchCount = matches.filter(m => m.matched).length;
  return (
    <div style={{ border: "1px solid var(--hairline-soft)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", background: "var(--surface-soft)", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="t-mono muted" style={{ fontSize: 10.5 }}>Last 6 signals · <span style={{ color: matchCount > 0 ? "var(--good)" : "var(--muted)", fontWeight: 600 }}>{matchCount} match</span></span>
        <span style={{ flex: 1 }} />
        <span className="t-mono muted" style={{ fontSize: 10 }}>predicates eval'd in 4ms</span>
      </div>
      {matches.map((m, i) => (
        <div key={m.signal.id} style={{
          display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center",
          padding: "8px 12px", borderBottom: i === matches.length - 1 ? "none" : "1px solid var(--hairline-soft)",
          background: m.matched ? "rgba(10,135,84,0.06)" : "transparent",
        }}>
          <SourceGlyph source={m.signal.source} size={14} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.signal.title}</div>
            <div className="t-mono muted" style={{ fontSize: 10, marginTop: 1 }}>{m.signal.kind}{m.signal.repo ? ` · ${m.signal.repo} ${m.signal.num}` : ""}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: m.matched ? "var(--good)" : "var(--muted-soft)" }}>
            {m.matched ? "✓ MATCH" : automation.predicates.length === 0 ? "—" : `${m.checks.filter(Boolean).length}/${m.checks.length}`}
          </span>
        </div>
      ))}
    </div>
  );
};

// ---------------- Builder ----------------

const AutomationBuilder = ({ automation: initial, isNew, onSave, onCancel }) => {
  const [a, setA] = useS_a(initial);
  const [activeStep, setActiveStep] = useS_a("trigger");
  const [previewOpen, setPreviewOpen] = useS_a(false);

  const update = (patch) => setA({ ...a, ...patch });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 12 }}>
        <input value={a.name} onChange={e => update({ name: e.target.value })}
          style={{ flex: 1, fontSize: 16, fontWeight: 600, border: "none", outline: "none", background: "transparent", color: "var(--foreground)", padding: "4px 0" }} />
        <span className="t-mono muted" style={{ fontSize: 10 }}>{isNew ? "NEW" : "EDIT"}</span>
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", padding: "20px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
      <BuilderStep n={1} title="When" subtitle="The event that triggers this automation" active={activeStep === "trigger"} onClick={() => setActiveStep("trigger")}>
          <TriggerStep trigger={a.trigger} onChange={(trigger) => update({ trigger })} />
        </BuilderStep>

        <BuilderStep n={2} title="If" subtitle="Optional filters — all must match (AND)" active={activeStep === "predicates"} onClick={() => setActiveStep("predicates")}>
          <PredicatesStep predicates={a.predicates} onChange={(predicates) => update({ predicates })} />
        </BuilderStep>

        <BuilderStep n={3} title="Then" subtitle="Actions to fire — they run in order" active={activeStep === "actions"} onClick={() => setActiveStep("actions")}>
          <ActionsStep actions={a.actions} onChange={(actions) => update({ actions })} />
        </BuilderStep>

        {/* Sentence summary always visible — small */}
        <SentenceSummary a={a} />

        {/* Collapsible live preview */}
        <div style={{ border: "1px solid var(--hairline-soft)", borderRadius: 10, background: "var(--surface-soft)" }}>
          <button onClick={() => setPreviewOpen(o => !o)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
          }}>
            <span style={{ display: "inline-block", transform: previewOpen ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--muted)" }}>▸</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Live preview</span>
            <span className="t-body-sm muted" style={{ flex: 1 }}>See which recent signals match before you save.</span>
          </button>
          {previewOpen && <div style={{ padding: "0 14px 14px" }}><LivePreview automation={a} /></div>}
        </div>

        {/* Dry-run row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "14px 16px", border: "1px solid var(--hairline-soft)", borderRadius: 10, background: "var(--surface-soft)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Dry-run mode</div>
            <div className="t-body-sm muted">Plan and log, but don't fire actions. Recommended while you're tuning predicates.</div>
          </div>
          <Toggle on={a.dryRun} onChange={(v) => update({ dryRun: v })} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 22px", borderTop: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="t-mono muted" style={{ fontSize: 11 }}>idempotent on (automation_id, trigger_event_id)</span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(a)} disabled={a.actions.length === 0}>
          {isNew ? "Create automation" : "Save changes"}
        </Button>
      </div>
    </div>
  );
};

const BuilderStep = ({ n, title, subtitle, active, onClick, children }) => (
  <div style={{
    border: active ? "1.5px solid var(--primary)" : "1px solid var(--hairline-soft)",
    borderRadius: 10, background: "var(--canvas)",
    transition: "border-color .15s",
  }}>
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12,
      padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: active ? "var(--primary)" : "var(--surface-strong)",
        color: active ? "white" : "var(--muted)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700,
      }}>{n}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
        <div className="t-body-sm muted" style={{ marginTop: 1 }}>{subtitle}</div>
      </div>
    </button>
    <div style={{ padding: "0 16px 16px" }}>{children}</div>
  </div>
);

// Trigger picker
const TriggerStep = ({ trigger, onChange }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {TRIGGER_KINDS.map(k => (
        <button key={k.id} onClick={() => onChange({ ...trigger, kind: k.id })} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px", border: trigger.kind === k.id ? "1.5px solid var(--primary)" : "1px solid var(--hairline-soft)",
          background: trigger.kind === k.id ? "var(--primary-disabled)" : "var(--canvas)",
          borderRadius: 8, cursor: "pointer", textAlign: "left",
        }}>
          <TriggerIcon kind={k.id} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{k.label}</div>
            <div className="t-body-sm muted" style={{ fontSize: 11, marginTop: 1, lineHeight: 1.3 }}>{k.desc}</div>
          </div>
        </button>
      ))}
    </div>
    {trigger.kind === "schedule" && (
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center", padding: "10px 12px", border: "1px solid var(--hairline-soft)", borderRadius: 8, background: "var(--surface-soft)" }}>
        <span className="t-mono muted" style={{ fontSize: 11 }}>CRON</span>
        <input value={trigger.cron || "0 9 * * 1-5"} onChange={e => onChange({ ...trigger, cron: e.target.value })}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "5px 8px", border: "1px solid var(--hairline-soft)", borderRadius: 5, outline: "none", background: "var(--canvas)", color: "var(--ink)" }} />
      </div>
    )}
    {trigger.kind === "signal_state_change" && (
      <div style={{ padding: "10px 12px", border: "1px solid var(--hairline-soft)", borderRadius: 8, background: "var(--surface-soft)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="t-mono muted" style={{ fontSize: 11, letterSpacing: 0.4 }}>WATCH FIELDS</span>
          <span className="t-body-sm muted" style={{ fontSize: 11, lineHeight: 1.4 }}>The automation only fires when one of these fields on a Signal changes value. Use dot-paths into <code style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, background: "var(--canvas)", padding: "1px 4px", borderRadius: 3 }}>signal.payload</code>.</span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
          {(trigger.watchFields || ["payload.commits_after_review"]).map(f => (
            <span key={f} className="chip" style={{ fontSize: 10.5, padding: "2px 8px", background: "var(--surface-strong)", color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{f} <span style={{ color: "var(--muted)", marginLeft: 4, cursor: "pointer" }}>×</span></span>
          ))}
          <button className="chip" style={{ fontSize: 10.5, padding: "2px 8px", border: "1px dashed var(--hairline)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>+ Add field</button>
        </div>
      </div>
    )}
  </div>
);

// Schema of known fields on the predicate-evaluable surface — values and ops are constrained from this.
const FIELD_SCHEMA = {
  "signal.source":   { label: "Source",   type: "enum", options: ["github", "slack", "linear", "calendar", "mail", "pagerduty"] },
  "signal.kind":     { label: "Kind",     type: "enum", options: ["pr_opened", "pr_review_requested", "pr_review_received", "pr_merged", "mention", "dm", "calendar_invite", "calendar_starting", "ticket_assigned", "alert"] },
  "signal.priority": { label: "Priority", type: "enum", options: ["low", "normal", "high", "critical"] },
  "signal.state":    { label: "State",    type: "enum", options: ["new", "acknowledged", "snoozed", "resolved"] },
  "signal.repo":     { label: "Repo",     type: "enum", options: ["frontend", "backend", "infra", "mobile", "design-system"] },
  "signal.labels":   { label: "Labels",   type: "multi", options: ["urgent", "blocked", "design", "security", "needs-review", "wip"] },
  "signal.is_focus_match": { label: "Focus rule matched", type: "bool" },
  "focus.tag":       { label: "Focus tag", type: "enum", options: ["deep_work", "meeting", "break"] },
  "signal.author_is_me": { label: "Author is me", type: "bool" },
  "transition.to":   { label: "New state",  type: "enum", options: ["merged", "closed", "approved", "review_requested", "ready_for_review"] },
};

const FIELD_LIST = Object.keys(FIELD_SCHEMA);

const opsForType = (t) => ({
  enum:  ["equals", "not_equals"],
  multi: ["contains_any", "contains_all", "not_contains"],
  bool:  ["is_true", "is_false"],
}[t] || ["equals"]);

const opLabel = { equals: "is", not_equals: "is not", contains_any: "contains any of", contains_all: "contains all of", not_contains: "does not contain", is_true: "is true", is_false: "is false" };

const defaultPredicate = (field) => {
  const s = FIELD_SCHEMA[field];
  if (s.type === "enum")  return { field, op: "equals", value: s.options[0] };
  if (s.type === "multi") return { field, op: "contains_any", value: [s.options[0]] };
  if (s.type === "bool")  return { field, op: "is_true", value: true };
  return { field, op: "equals", value: "" };
};

const PredicateValueControl = ({ p, schema, onChange }) => {
  const baseStyle = { fontSize: 11.5, padding: "5px 8px", border: "1px solid var(--hairline-soft)", borderRadius: 5, outline: "none", background: "var(--canvas)", color: "var(--ink)", width: "100%" };
  if (schema.type === "bool") return <span style={{ fontSize: 11, color: "var(--muted-soft)", fontStyle: "italic" }}>—</span>;
  if (schema.type === "enum") {
    return (
      <select value={p.value} onChange={e => onChange(e.target.value)} style={baseStyle}>
        {schema.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (schema.type === "multi") {
    const value = Array.isArray(p.value) ? p.value : [];
    const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {schema.options.map(o => {
          const on = value.includes(o);
          return (
            <button key={o} onClick={() => toggle(o)}
              style={{ fontSize: 10.5, padding: "3px 8px", borderRadius: 999, border: "1px solid " + (on ? "var(--primary)" : "var(--hairline-soft)"), background: on ? "var(--primary-disabled)" : "var(--canvas)", color: on ? "var(--primary-active)" : "var(--muted)", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  return null;
};

const PredicatesStep = ({ predicates, onChange }) => {
  const update = (i, p) => onChange(predicates.map((x, idx) => idx === i ? p : x));
  const remove = (i) => onChange(predicates.filter((_, idx) => idx !== i));
  const add = () => onChange([...predicates, defaultPredicate("signal.source")]);
  const changeField = (i, field) => update(i, defaultPredicate(field));
  const changeOp = (i, op) => {
    const p = predicates[i];
    let value = p.value;
    if (op === "is_true") value = true;
    if (op === "is_false") value = false;
    update(i, { ...p, op, value });
  };
  if (predicates.length === 0) {
    return (
      <div style={{ padding: "12px 14px", border: "1px dashed var(--hairline)", borderRadius: 8, fontSize: 12, color: "var(--muted-soft)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1 }}>No filters — automation fires on every event of this kind.</span>
        <Button variant="ghost" size="sm" icon="plus" onClick={add}>Add filter</Button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {predicates.map((p, i) => {
        const schema = FIELD_SCHEMA[p.field] || FIELD_SCHEMA["signal.source"];
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 160px 130px 1fr auto", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--muted-soft)", width: 22 }}>{i === 0 ? "IF" : "AND"}</span>
            <select value={p.field} onChange={e => changeField(i, e.target.value)}
              style={{ fontSize: 11.5, padding: "5px 6px", border: "1px solid var(--hairline-soft)", borderRadius: 5, outline: "none", background: "var(--canvas)", color: "var(--ink)" }}>
              {FIELD_LIST.map(f => <option key={f} value={f}>{FIELD_SCHEMA[f].label} ({f})</option>)}
            </select>
            <select value={p.op} onChange={e => changeOp(i, e.target.value)}
              style={{ fontSize: 11.5, padding: "5px 6px", border: "1px solid var(--hairline-soft)", borderRadius: 5, outline: "none", background: "var(--canvas)", color: "var(--ink)" }}>
              {opsForType(schema.type).map(o => <option key={o} value={o}>{opLabel[o] || o}</option>)}
            </select>
            <PredicateValueControl p={p} schema={schema} onChange={(value) => update(i, { ...p, value })} />
            <button onClick={() => remove(i)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1 }}>×</button>
          </div>
        );
      })}
      <span style={{ alignSelf: "flex-start" }}><Button variant="ghost" size="sm" icon="plus" onClick={add}>Add filter</Button></span>
    </div>
  );
};

const ActionsStep = ({ actions, onChange }) => {
  const [picking, setPicking] = useS_a(false);
  const remove = (i) => onChange(actions.filter((_, idx) => idx !== i));
  const update = (i, a) => onChange(actions.map((x, idx) => idx === i ? a : x));
  const add = (kind) => {
    const defaultConfig = kind === "slack_post_message" ? { target: "channel", channel: "#reviews", body: "{{signal.title}}\n{{signal.url}}" }
      : kind === "tag" ? { tags: ["urgent"] }
      : kind === "snooze" ? { until: "tomorrow_9am" }
      : kind === "set_priority" ? { priority: "high" }
      : kind === "set_focus" ? { minutes: 25 }
      : kind === "transition_ticket" ? { to: "Done" }
      : {};
    onChange([...actions, { kind, config: defaultConfig }]);
    setPicking(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {actions.map((act, i) => <ActionEditor key={i} action={act} index={i} onChange={(a) => update(i, a)} onRemove={() => remove(i)} />)}
      {picking ? (
        <div style={{ border: "1.5px dashed var(--primary)", borderRadius: 8, padding: 10, background: "var(--primary-disabled)" }}>
          <div className="t-tag" style={{ marginBottom: 8, color: "var(--primary-active)" }}>PICK AN ACTION</div>
          <ActionPicker onPick={add} onCancel={() => setPicking(false)} />
        </div>
      ) : (
        <span style={{ alignSelf: "flex-start" }}><Button variant="ghost" size="sm" icon="plus" onClick={() => setPicking(true)}>Add action</Button></span>
      )}
    </div>
  );
};

const ActionPicker = ({ onPick, onCancel }) => {
  const groups = ["Slack", "GitHub", "Focus", "Internal", "Tickets"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map(g => (
        <div key={g}>
          <div className="t-mono muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>{g.toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ACTION_KINDS.filter(a => a.group === g).map(a => (
              <button key={a.id} onClick={() => onPick(a.id)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                border: "1px solid var(--hairline-soft)", borderRadius: 6, background: "var(--canvas)",
                cursor: a.cap ? "pointer" : "not-allowed", textAlign: "left", opacity: a.cap ? 1 : 0.6,
              }} disabled={!a.cap} title={a.cap ? "" : "Capability not yet wired — action will be a no-op"}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{a.label}</span>
                <span className="t-body-sm muted" style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.desc}</span>
                {!a.cap && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--warn-soft)", color: "var(--warn)", letterSpacing: 0.4 }}>NOT WIRED</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <span style={{ alignSelf: "flex-end" }}><Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button></span>
    </div>
  );
};

const ActionEditor = ({ action, index, onChange, onRemove }) => {
  const meta = actionMeta(action.kind);
  const update = (configPatch) => onChange({ ...action, config: { ...action.config, ...configPatch } });
  return (
    <div style={{ border: "1px solid var(--hairline-soft)", borderRadius: 8, background: "var(--canvas)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid var(--hairline-soft)" }}>
        <span style={{ width: 18, height: 18, borderRadius: 999, background: "var(--primary)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{index + 1}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{meta?.label}</span>
        <span className="t-mono muted" style={{ fontSize: 10 }}>{meta?.group}</span>
        {!meta?.cap && <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--warn-soft)", color: "var(--warn)", letterSpacing: 0.4 }}>NOT WIRED</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onRemove} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {action.kind === "slack_post_message" && (
          <SlackPostEditor cfg={action.config} update={update} />
        )}
        {action.kind === "tag" && (
          <div>
            <DetailLabel>TAGS</DetailLabel>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(action.config.tags || []).map((t, i) => (
                <span key={i} className="chip" style={{ fontSize: 11, padding: "2px 8px", background: "var(--surface-strong)", color: "var(--ink)", fontFamily: "var(--font-mono)" }}>{t} <span style={{ color: "var(--muted)", marginLeft: 4, cursor: "pointer" }} onClick={() => update({ tags: action.config.tags.filter((_, idx) => idx !== i) })}>×</span></span>
              ))}
              <button className="chip" style={{ fontSize: 11, padding: "2px 8px", border: "1px dashed var(--hairline)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}>+ Tag</button>
            </div>
          </div>
        )}
        {action.kind === "transition_ticket" && (
          <div>
            <div className="t-body-sm" style={{ color: "var(--warn)", marginBottom: 8 }}>⚠ Linear / Jira capability not yet wired. This action will plan but execute as a no-op.</div>
            <DetailLabel>TRANSITION TO</DetailLabel>
            <input value={action.config.to || "Done"} onChange={e => update({ to: e.target.value })}
              style={{ fontSize: 12.5, padding: "6px 10px", border: "1px solid var(--hairline-soft)", borderRadius: 6, outline: "none", background: "var(--canvas)", color: "var(--ink)" }} />
          </div>
        )}
        {action.kind === "set_focus" && (
          <div>
            <DetailLabel>FOCUS DURATION</DetailLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={action.config.minutes || 25} onChange={e => update({ minutes: Number(e.target.value) })}
                style={{ width: 80, fontSize: 12.5, padding: "6px 10px", border: "1px solid var(--hairline-soft)", borderRadius: 6, outline: "none", background: "var(--canvas)", color: "var(--ink)" }} />
              <span className="t-body-sm muted">minutes</span>
            </div>
          </div>
        )}
        {(action.kind === "snooze" || action.kind === "set_priority" || action.kind === "dismiss") && (
          <div className="t-body-sm muted" style={{ fontSize: 11.5 }}>
            {action.kind === "dismiss" ? "No configuration — dismisses the triggering signal."
              : action.kind === "snooze" ? `Hides until: ${action.config.until || "tomorrow_9am"}`
              : `Sets priority to: ${action.config.priority || "high"}`}
          </div>
        )}
      </div>
    </div>
  );
};

const SlackPostEditor = ({ cfg, update }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div>
      <DetailLabel>POST TO</DetailLabel>
      <div style={{ display: "flex", gap: 4 }}>
        {[
          { id: "channel", label: "Channel" },
          { id: "self_dm", label: "Self-DM" },
          { id: "thread_reply", label: "Thread reply" },
        ].map(t => (
          <button key={t.id} onClick={() => update({ target: t.id })} style={{
            padding: "5px 12px", borderRadius: 6, border: "1px solid var(--hairline-soft)",
            background: cfg.target === t.id ? "var(--primary-disabled)" : "var(--canvas)",
            color: cfg.target === t.id ? "var(--primary-active)" : "var(--ink)",
            fontSize: 11.5, fontWeight: cfg.target === t.id ? 600 : 500, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>
      {cfg.target === "channel" && (
        <Input value={cfg.channel || ""} onChange={e => update({ channel: e.target.value })} placeholder="#channel-name" style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 12, width: 240 }} />
      )}
      {cfg.target === "thread_reply" && (
        <div className="t-body-sm muted" style={{ marginTop: 6, fontSize: 11.5 }}>Reply will land in the thread of the triggering Slack signal.</div>
      )}
    </div>
    <div>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
        <DetailLabel inline>MESSAGE BODY</DetailLabel>
        <span style={{ flex: 1 }} />
        <span className="t-mono muted" style={{ fontSize: 9.5 }}>supports {`{{ signal.field }}`} templating</span>
      </div>
      <textarea value={cfg.body || ""} onChange={e => update({ body: e.target.value })} rows={4}
        style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, padding: "8px 10px", border: "1px solid var(--hairline-soft)", borderRadius: 6, outline: "none", background: "var(--canvas)", color: "var(--ink)", resize: "vertical", lineHeight: 1.5 }} />
      <div style={{ marginTop: 6, padding: "6px 10px", background: "var(--surface-soft)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--body)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {renderTemplate(cfg.body || "")}
      </div>
    </div>
  </div>
);

// ---------------- Runs view ----------------

const RunsView = ({ automation: a, onBack }) => {
  // Synthesize more rows for full history
  const base = FIXTURE_RUNS[a.id] || [];
  const padded = base.length > 0 ? base : Array.from({ length: 5 }, (_, i) => ({
    ts: new Date(Date.now() - i * 7 * 3600 * 1000).toISOString(),
    status: "succeeded", trigger: `signal:s_${4400 + i}`, actions: [{ kind: "slack_post_message", ref: "channel #reviews · ts " + (1715000000 + i * 1000) }],
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--hairline-soft)", display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{a.name} · runs</h3>
        <span style={{ flex: 1 }} />
        <span className="t-mono muted" style={{ fontSize: 11 }}>{a.stats.totalRuns} runs · {a.stats.fail7d} failed (7d)</span>
      </div>
      <div style={{ overflowY: "auto", padding: "16px 22px", flex: 1 }}>
        {/* mini hist */}
        <RunsHistogram runs={padded} />
        <div style={{ marginTop: 18, border: "1px solid var(--hairline-soft)", borderRadius: 8, overflow: "hidden" }}>
          {padded.map((r, i) => <RunRow key={i} r={r} last={i === padded.length - 1} />)}
        </div>
      </div>
    </div>
  );
};

const RunsHistogram = ({ runs }) => {
  // 14 day buckets
  const days = 14;
  const buckets = Array.from({ length: days }, (_, i) => ({ d: i, ok: 0, fail: 0, dry: 0 }));
  const now = Date.now();
  runs.forEach(r => {
    const ageDays = Math.floor((now - new Date(r.ts).getTime()) / (24 * 3600 * 1000));
    if (ageDays >= 0 && ageDays < days) {
      const b = buckets[days - 1 - ageDays];
      if (r.status === "failed") b.fail++;
      else if (r.status === "skipped_dry_run") b.dry++;
      else b.ok++;
    }
  });
  const max = Math.max(1, ...buckets.map(b => b.ok + b.fail + b.dry));
  return (
    <div>
      <div className="t-mono muted" style={{ fontSize: 10, letterSpacing: 0.6, marginBottom: 8 }}>LAST 14 DAYS</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
        {buckets.map((b, i) => {
          const total = b.ok + b.fail + b.dry;
          const h = total / max * 60;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 60, gap: 1 }}>
              {b.fail > 0 && <div style={{ height: b.fail / max * 60, background: "var(--danger)", borderRadius: "3px 3px 0 0" }} />}
              {b.dry > 0 && <div style={{ height: b.dry / max * 60, background: "var(--warn)" }} />}
              {b.ok > 0 && <div style={{ height: b.ok / max * 60, background: "var(--good)", borderRadius: total === b.ok ? "3px 3px 0 0" : 0 }} />}
              {total === 0 && <div style={{ height: 2, background: "var(--hairline)" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------- Empty state ----------------

const EmptyState = ({ onCreate }) => (
  <div style={{ padding: "60px 40px", border: "1px dashed var(--hairline)", borderRadius: 12, background: "var(--surface-soft)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
    <Icon name="activity" size={40} style={{ color: "var(--muted-foreground)" }} />
    <div className="t-display-md">No automations yet</div>
    <div className="t-body muted" style={{ maxWidth: 420, lineHeight: 1.5 }}>
      Connect events from one tool to actions in another. Post to Slack when your PR is up, auto-reply during Focus, transition tickets when a PR merges.
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
      <Button variant="primary" icon="plus" onClick={onCreate}>New automation</Button>
      <Button variant="secondary">Browse templates</Button>
    </div>
  </div>
);

window.AutomationsPanel = AutomationsPanel;
