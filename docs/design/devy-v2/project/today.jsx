// Today page — Next up hero, briefing, inbox preview, schedule, week stats

const { useState: useState_t, useEffect: useEffect_t, useMemo: useMemo_t } = React;

// Live countdown to a target ISO time
const useCountdown = (targetIso) => {
  const [now, setNow] = useState_t(() => Date.now());
  useEffect_t(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(targetIso).getTime() - now;
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    mm: String(Math.floor(total / 60)).padStart(2, "0"),
    ss: String(total % 60).padStart(2, "0"),
    minutes: Math.floor(total / 60),
    pct: Math.max(0, Math.min(1, ms / (15 * 60_000))), // assume 15-min lookahead
  };
};

const NextUpHero = ({ signal }) => {
  const cd = useCountdown(signal.when);
  return (
    <div style={{
      borderRadius: 20, padding: "28px 28px 24px",
      background: "var(--surface-card)",
      border: "1px solid var(--hairline-soft)",
      display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "stretch",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SourceGlyph source="cal" size={22} />
          <span className="t-caption muted">Next up · in 13 min</span>
          <span className="chip" style={{ marginLeft: 8, fontSize: 11, padding: "2px 10px", background: "var(--accent-tint)", color: "var(--accent-active)" }}>10-min alert armed</span>
        </div>
        <div className="t-display-md" style={{ marginTop: 4 }}>{signal.title}</div>
        <div className="t-body muted">{signal.sub}</div>

        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="t-tag muted">AGENDA · pulled from invite</div>
          {signal.agenda.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: "var(--body)" }}>
              <span style={{ color: "var(--muted-soft)" }}>·</span>
              <span>{line}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="6" width="13" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>
            </svg>
            Join meeting
          </button>
          <button className="btn btn-secondary">Open agenda</button>
          <button className="btn btn-ghost" style={{ color: "var(--muted)" }}>Skip 10-min alert</button>
        </div>
      </div>

      {/* countdown ring — the signature loud moment */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 8px",
      }}>
        <CountdownRing minutes={cd.minutes} mm={cd.mm} ss={cd.ss} />
        <div className="t-mono muted" style={{ marginTop: 10 }}>10:00 → 10:15</div>
      </div>
    </div>
  );
};

const CountdownRing = ({ minutes, mm, ss }) => {
  // ring shows fraction of 15 mins remaining
  const total = Math.min(15, minutes + 1);
  const frac = total / 15;
  const C = 2 * Math.PI * 60;
  return (
    <div style={{ position: "relative", width: 160, height: 160 }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="80" cy="80" r="60" fill="none" stroke="var(--hairline-soft)" strokeWidth="3" />
        <circle
          cx="80" cy="80" r="60" fill="none"
          stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${frac * C} ${C}`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="t-rating" style={{ fontFamily: "var(--font-mono)", fontSize: 44, fontWeight: 700, letterSpacing: -2 }}>
          {mm}<span style={{ color: "var(--muted-soft)" }}>:</span>{ss}
        </div>
        <div className="t-tag muted">UNTIL STANDUP</div>
      </div>
    </div>
  );
};

const BriefingCard = ({ text }) => {
  // bold marker support — split on **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="card" style={{ padding: 22, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SourceGlyph source="ai" size={20} />
        <span className="t-title-md">Morning briefing</span>
        <span className="t-tag muted" style={{ marginLeft: 4 }}>HAIKU 4.5 · 7s · $0.003</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", height: 28, padding: "0 10px", fontSize: 12 }}>Regenerate</button>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--body)" }}>
        {parts.map((p, i) =>
          p.startsWith("**")
            ? <strong key={i} style={{ color: "var(--ink)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>
            : <span key={i}>{p}</span>
        )}
      </p>
    </div>
  );
};

const InboxPreviewRow = ({ s, onOpen }) => {
  const ago = relAgo(s.age);
  return (
    <button
      onClick={onOpen}
      style={{
        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
        padding: "12px 12px", borderRadius: 8,
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        width: "100%",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-soft)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SourceGlyph source={s.source} size={20} />
        {s.unread > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.repo ? `${s.repo} ${s.num} · ${s.author}` : (s.sub || "")}
        </div>
      </div>
      <div className="t-mono muted" style={{ fontSize: 11 }}>{ago}</div>
    </button>
  );
};

const relAgo = (iso) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
};

const TodaySchedule = ({ schedule }) => {
  const cur = "10:00"; // fake "now" cursor at standup
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
        <span className="t-title-md">Today</span>
        <span className="t-caption muted" style={{ marginLeft: 8 }}>Mon · May 4</span>
        <span style={{ flex: 1 }} />
        <span className="t-caption muted">9:47 AM</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {schedule.map((b, i) => {
          const isCurrent = b.t === cur;
          const isFocus = b.kind === "focus";
          const isMeeting = b.kind === "meeting";
          const isBreak = b.kind === "break";
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "60px 6px 1fr auto", gap: 14, alignItems: "center",
              padding: "8px 0", position: "relative",
              opacity: isCurrent ? 1 : 0.95,
            }}>
              <div className="t-mono" style={{ color: "var(--muted)", fontSize: 11, textAlign: "right" }}>
                {b.t}<span style={{ color: "var(--muted-soft)" }}> – {b.end}</span>
              </div>
              <div style={{
                width: 6, height: "100%",
                background: isFocus ? "var(--ink)" : isMeeting ? "var(--accent)" : isBreak ? "var(--surface-strong)" : "var(--hairline)",
                borderRadius: 999, minHeight: 28,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: isCurrent ? 700 : 500,
                  color: isBreak ? "var(--muted)" : "var(--ink)",
                  textDecoration: isBreak ? "none" : "none",
                }}>
                  {b.title}
                  {isCurrent && <span className="chip" style={{ marginLeft: 8, fontSize: 10, padding: "1px 8px", background: "var(--accent-tint)", color: "var(--accent-active)" }}>NOW</span>}
                </div>
                <div className="t-mono muted" style={{ fontSize: 11, marginTop: 1 }}>
                  {isFocus ? "deep work · DND" : isMeeting ? "google meet" : isBreak ? "blocked" : "buffer"}
                </div>
              </div>
              {b.join && <button className="btn btn-secondary" style={{ height: 28, padding: "0 12px", fontSize: 12 }}>Join</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InProgressTickets = ({ tickets }) => (
  <div className="card" style={{ padding: "20px 22px" }}>
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
      <span className="t-title-md">In progress</span>
      <span className="t-caption muted" style={{ marginLeft: 8 }}>{tickets.length} tickets</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {tickets.map(t => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 0", borderBottom: "1px solid var(--hairline-soft)",
        }}>
          <span className="t-mono" style={{
            fontSize: 11, fontWeight: 600,
            background: "var(--surface-strong)", color: "var(--body)",
            padding: "3px 8px", borderRadius: 6,
          }}>{t.id}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
            <div className="t-mono muted" style={{ fontSize: 11, marginTop: 2 }}>
              {t.p} · {t.days}d in progress {t.pr && `· PR ${t.pr}`}
            </div>
          </div>
          <span className="dot dot-good" />
        </div>
      ))}
    </div>
  </div>
);

// ----- Pulse card (Direction D): donut + line + bars -----

const SOURCE_MIX = [
  { k: "GitHub",   v: 38, c: "var(--src-git)" },
  { k: "Slack",    v: 27, c: "var(--src-slack)" },
  { k: "Calendar", v: 18, c: "var(--src-cal)" },
  { k: "Linear",   v: 12, c: "var(--src-task)" },
  { k: "AI",       v: 5,  c: "var(--src-ai)" },
];
const REVIEW_LATENCY_HOURS = [9, 11, 7, 6, 8, 5, 4];
const SHIP_BY_DAY = [
  { d: "Mon", prs: 2, tickets: 1 },
  { d: "Tue", prs: 3, tickets: 1 },
  { d: "Wed", prs: 1, tickets: 0 },
  { d: "Thu", prs: 4, tickets: 2 },
  { d: "Fri", prs: 2, tickets: 0 },
];

const PulseDonut = ({ data, size = 120 }) => {
  const total = data.reduce((a, b) => a + b.v, 0);
  const C = 2 * Math.PI * 44;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <g transform="translate(60 60) rotate(-90)">
        {data.map((d, i) => {
          const len = (d.v / total) * C;
          const el = (
            <circle key={i} r="44" cx="0" cy="0" fill="none"
                    stroke={d.c} strokeWidth="14"
                    strokeDasharray={`${len} ${C - len}`}
                    strokeDashoffset={-off} />
          );
          off += len;
          return el;
        })}
      </g>
      <text x="60" y="58" textAnchor="middle"
            style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, fill: "var(--ink)" }}>{total}</text>
      <text x="60" y="72" textAnchor="middle"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-soft)", letterSpacing: 0.3 }}>signals</text>
    </svg>
  );
};

const PulseLine = ({ values, w = 220, h = 90, color = "var(--accent)" }) => {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / (max - min || 1)) * (h - 16) - 8]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} width="100%" height={h + 18}>
      <line x1="0" x2={w} y1={h - 8} y2={h - 8} stroke="var(--hairline-soft)" strokeWidth="1" />
      <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5}
                fill={i === pts.length - 1 ? color : "var(--canvas)"}
                stroke={color} strokeWidth="1.5" />
      ))}
      <text x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1] - 8} textAnchor="end"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, fill: color }}>
        {values[values.length - 1]}h
      </text>
    </svg>
  );
};

const PulseBars = ({ data, h = 90 }) => {
  const max = Math.max(...data.map(d => Math.max(d.prs, d.tickets)));
  return (
    <svg viewBox={`0 0 240 ${h + 22}`} width="100%" height={h + 22}>
      {data.map((d, i) => {
        const x = 8 + i * 46;
        const ph = (d.prs / max) * h;
        const th = (d.tickets / max) * h;
        return (
          <g key={i}>
            <rect x={x} y={h - ph} width={16} height={ph} fill="var(--ink)" rx={2} />
            <rect x={x + 18} y={h - th} width={16} height={th} fill="var(--accent)" opacity={0.85} rx={2} />
            <text x={x + 17} y={h + 14} textAnchor="middle"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-soft)", letterSpacing: 0.3 }}>{d.d}</text>
          </g>
        );
      })}
    </svg>
  );
};

const WeekStats = ({ stats }) => {
  const total = SOURCE_MIX.reduce((a, b) => a + b.v, 0);
  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
        <span className="t-title-md">Pulse</span>
        <span className="t-caption muted" style={{ marginLeft: 8 }}>last 7 days</span>
        <span style={{ flex: 1 }} />
        <span className="t-mono muted" style={{ fontSize: 11 }}>updated 32s ago</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        {/* Donut — signal mix */}
        <div style={{ paddingRight: 20, borderRight: "1px solid var(--hairline-soft)", display: "flex", gap: 14, alignItems: "center" }}>
          <PulseDonut data={SOURCE_MIX} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SOURCE_MIX.map(s => (
              <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, background: s.c, borderRadius: 2, display: "inline-block" }} />
                <span style={{ color: "var(--ink)", minWidth: 56 }}>{s.k}</span>
                <span className="t-mono muted">{s.v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Line — review latency */}
        <div style={{ padding: "0 20px", borderRight: "1px solid var(--hairline-soft)" }}>
          <div className="t-mono muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Review latency</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>median time-to-first-comment, lower is better</div>
          <div style={{ marginTop: 8 }}><PulseLine values={REVIEW_LATENCY_HOURS} /></div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--good)", fontWeight: 500 }}>↓ 5h faster than 7d ago</div>
        </div>
        {/* Bars — shipped */}
        <div style={{ paddingLeft: 20 }}>
          <div className="t-mono muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Shipped this week</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>PRs merged · Tickets closed</div>
          <div style={{ marginTop: 8 }}><PulseBars data={SHIP_BY_DAY} /></div>
          <div style={{ marginTop: 4, display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ink)", borderRadius: 2, marginRight: 6 }} />{stats.prs_reviewed} PRs</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--accent)", borderRadius: 2, marginRight: 6 }} />{stats.tickets_shipped} tickets</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TodayPage = ({ onOpenInbox }) => {
  const sigs = window.DevyData.SIGNALS;
  const nextUp = sigs.find(s => s.id === "s1");
  const previewRows = sigs.filter(s => s.requires_action && s.id !== "s1").slice(0, 6);

  return (
    <div style={{ padding: "32px 40px 64px", maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* greeting */}
      <header style={{ marginBottom: 4 }}>
        <div className="t-display-xl" style={{ letterSpacing: -0.6 }}>Good morning, Erin.</div>
        <div className="t-body muted" style={{ marginTop: 4 }}>
          5 things need you · 3 meetings today · quiet hours end at 09:00
        </div>
      </header>

      <WeekStats stats={window.DevyData.WEEK_STATS} />

      <NextUpHero signal={nextUp} />

      <BriefingCard text={window.DevyData.BRIEFING} />

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        {/* Inbox preview */}
        <div className="card" style={{ padding: "20px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", padding: "0 6px", marginBottom: 8 }}>
            <span className="t-title-md">Needs you</span>
            <span className="t-caption muted" style={{ marginLeft: 8 }}>5 unread</span>
            <span style={{ flex: 1 }} />
            <button onClick={onOpenInbox} className="btn btn-ghost" style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
              Open inbox →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {previewRows.map(s => <InboxPreviewRow key={s.id} s={s} onOpen={onOpenInbox} />)}
          </div>
        </div>

        <InProgressTickets tickets={window.DevyData.IN_PROGRESS} />
      </div>

      <TodaySchedule schedule={window.DevyData.TODAY_SCHEDULE} />
    </div>
  );
};

window.TodayPage = TodayPage;
window.relAgo = relAgo;
