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
    pct: Math.max(0, Math.min(1, ms / (15 * 60_000)))
  };
};

// Polymorphic Now block: adapts to context.
//   - meeting <30m away → MeetingCountdown variant
//   - in a focus block → FocusActive variant
//   - nothing soon, inbox-zero → CalmEmpty variant
//   - nothing soon, signals waiting → ReviewQueue variant
const NowBlock = ({ signal }) => {
  const cd = useCountdown(signal.when);
  const minutesUntil = cd.minutes;

  // Meeting soon
  if (minutesUntil <= 30) {
    return <MeetingCountdownNow signal={signal} cd={cd} />;
  }
  // Otherwise pick a non-meeting variant — for the prototype we'll show focus state
  return <FocusReadyNow signal={signal} cd={cd} />;
};

// Format an ISO time as "9:30 AM"
const fmtClockTime = (iso) => {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
};

// VARIANT A — Meeting countdown (the imminent case)
// Live mm:ss timer only when <=10m away. Otherwise show the meeting start time.
const MeetingCountdownNow = ({ signal, cd }) => {
  const urgent = cd.minutes <= 10;
  // Hardcoded urgent palette so it reads correctly in both light and dark mode
  const URGENT_BG = "#1b1b1b";
  const URGENT_FG = "#ffffff";
  const startLabel = fmtClockTime(signal.when);
  return (
    <div style={{
      borderRadius: 20, padding: "26px 28px",
      background: urgent ? URGENT_BG : "var(--surface-card)",
      color: urgent ? URGENT_FG : "var(--ink)",
      border: urgent ? "none" : "1px solid var(--hairline-soft)",
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center",
      transition: "background .3s"
    }}>
      {/* Big timer (countdown when imminent, otherwise static start time) */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        {urgent ?
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 64, fontWeight: 700,
          letterSpacing: -3, lineHeight: 1,
          color: "var(--primary)"
        }}>{cd.mm}<span style={{ opacity: 0.4 }}>:</span>{cd.ss}</span> :

        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 56, fontWeight: 700,
          letterSpacing: -2, lineHeight: 1,
          color: "var(--ink)"
        }}>{startLabel}</span>
        }
        <span className="t-tag" style={{ marginTop: 6, color: urgent ? "rgba(255,255,255,.55)" : "var(--muted)", letterSpacing: 0.6 }}>
          {urgent ?
          <>UNTIL {signal.title.split("—")[0].trim().toUpperCase()}</> :
          <>STARTS IN {cd.minutes}M · {signal.title.split("—")[0].trim().toUpperCase()}</>
          }
        </span>
      </div>

      {/* Center column — context */}
      <div style={{ minWidth: 0, paddingLeft: 8, borderLeft: urgent ? "1px solid rgba(255,255,255,.15)" : "1px solid var(--hairline-soft)", paddingLeft: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <SourceGlyph source="cal" size={16} />
          <span style={{ fontSize: 12, color: urgent ? "rgba(255,255,255,.6)" : "var(--muted)" }}>10:00 → 10:15 · Google Meet · 9 attendees</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 10, color: urgent ? URGENT_FG : "var(--ink)" }}>{signal.title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {signal.agenda.slice(0, 3).map((line, i) =>
          <div key={i} style={{ fontSize: 12, color: urgent ? "rgba(255,255,255,.7)" : "var(--body)", display: "flex", gap: 8 }}>
              <span style={{ color: urgent ? "rgba(255,255,255,.35)" : "var(--muted-soft)" }}>·</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", minWidth: 160 }}>
        <Button variant="primary" size="lg" icon="video">Join meeting</Button>
        <Button variant={urgent ? "ghost" : "outline"} size="sm" style={urgent ? { color: URGENT_FG, borderColor: "rgba(255,255,255,.2)" } : undefined}>Open agenda</Button>
      </div>
    </div>);

};

// VARIANT B — Focus / nothing-imminent state. Encourages deep work.
const FocusReadyNow = ({ signal, cd }) =>
<div style={{
  borderRadius: 20, padding: "28px 28px",
  background: "var(--surface-card)",
  border: "1px solid var(--hairline-soft)",
  display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "center"
}}>
    <div>
      <span className="t-tag muted">RIGHT NOW</span>
      <div className="t-display-md" style={{ marginTop: 6, marginBottom: 8 }}>
        Clear runway — {cd.minutes}m until standup
      </div>
      <div className="t-body muted" style={{ marginBottom: 14 }}>
        Enough time for a focused review pass. <b style={{ color: "var(--ink)" }}>#421 (Priya)</b> is your highest-leverage open thread.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="primary" icon="target">Start 25-min focus</Button>
        <Button variant="outline" iconRight="arrow-right">Open #421</Button>
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <CountdownRing minutes={cd.minutes} mm={cd.mm} ss={cd.ss} />
      <div className="t-mono muted" style={{ marginTop: 10 }}>10:00 → 10:15</div>
    </div>
  </div>;


// keep old name for compatibility
const NextUpHero = NowBlock;

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
          stroke="var(--primary)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${frac * C} ${C}`} />
        
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div className="t-rating" style={{ fontFamily: "var(--font-mono)", fontSize: 44, fontWeight: 700, letterSpacing: -2 }}>
          {mm}<span style={{ color: "var(--muted-soft)" }}>:</span>{ss}
        </div>
        <div className="t-tag muted">UNTIL STANDUP</div>
      </div>
    </div>);

};

const PRIORITY_STYLES = {
  high: { dot: "var(--brand-blue)", soft: "var(--brand-blue-soft)", label: "ACT NOW" },
  watch: { dot: "var(--warn)", soft: "var(--warn-soft)", label: "WATCH" },
  plan: { dot: "var(--brand-lavender)", soft: "var(--brand-lavender-soft)", label: "PLANNED" },
  skip: { dot: "var(--muted-foreground)", soft: "var(--surface-soft)", label: "AUTO" }
};

const BriefingItem = ({ item }) => {
  const p = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.plan;
  return (
    <div style={{
      padding: "8px 12px 8px 14px", borderRadius: 8,
      border: "1px solid var(--border)", background: "var(--background)",
      display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12,
      position: "relative"
    }}>
      {/* left priority rail */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: p.dot, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} />
      {/* tag column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 72 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
          padding: "2px 6px", borderRadius: 3,
          background: p.soft, color: p.dot, whiteSpace: "nowrap"
        }}>{p.label}</span>
        <span className="t-mono" style={{ fontSize: 9.5, color: "var(--muted-foreground)" }}>{item.tag}</span>
      </div>
      {/* title + body */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SourceGlyph source={item.source} size={12} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
          <span style={{ fontSize: 10, color: "var(--muted-foreground)", flexShrink: 0 }}>· {item.reason}</span>
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.4, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.body}</div>
      </div>
      {/* cta */}
      {item.cta &&
      <Button variant="ghost" size="sm" icon={item.cta.icon}>{item.cta.label}</Button>
      }
    </div>);

};

const BriefingEmpty = ({ onConnect }) =>
<div className="card" style={{
  padding: "20px 22px", display: "grid", gridTemplateColumns: "auto 1fr auto",
  gap: 16, alignItems: "center",
  borderStyle: "dashed", borderColor: "var(--hairline-soft)", background: "var(--surface-soft)"
}}>
    <div style={{
    width: 36, height: 36, borderRadius: 10,
    background: "var(--surface-card)",
    border: "1px dashed var(--hairline-soft)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    color: "var(--muted-foreground)", flexShrink: 0
  }}>
      <Icon name="sparkles" size={16} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="t-title-md" style={{ fontSize: 14 }}>Morning rundown is off</span>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
        Connect an AI provider (Anthropic, OpenAI, Google, or Groq) and Devy will generate a daily briefing from your signals — your key, your inference, no shared model.
      </span>
    </div>
    <Button variant="primary" size="sm" icon="plug" onClick={onConnect}>Connect provider</Button>
  </div>;


const BriefingCard = ({ data, suppressed, aiConnected, onConnect }) => {
  if (suppressed) return null;
  if (!aiConnected) return <BriefingEmpty onConnect={onConnect} />;
  return (
    <div className="card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-lavender) 100%)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "white", flexShrink: 0
        }}>
          <Icon name="sparkles" size={14} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span className="t-title-md" style={{ fontSize: 14 }}>Morning rundown</span>
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{data.headline}</span>
        </div>
        <span style={{ flex: 1 }} />
        <span className="t-mono" style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{data.model} · {data.duration} · {data.generatedAt}</span>
        <IconButton icon="refresh-cw" label="Regenerate" size="sm" />
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.items.map((item) => <BriefingItem key={item.id} item={item} />)}
      </div>
    </div>);

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
        width: "100%"
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-soft)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SourceGlyph source={s.source} size={20} />
        {s.unread > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.repo ? `${s.repo} ${s.num} · ${s.author}` : s.sub || ""}
        </div>
      </div>
      <div className="t-mono muted" style={{ fontSize: 11 }}>{ago}</div>
    </button>);

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
              opacity: isCurrent ? 1 : 0.95
            }}>
              <div className="t-mono" style={{ color: "var(--muted)", fontSize: 11, textAlign: "right" }}>
                {b.t}<span style={{ color: "var(--muted-soft)" }}> – {b.end}</span>
              </div>
              <div style={{
                width: 6, height: "100%",
                background: isFocus ? "var(--ink)" : isMeeting ? "var(--primary)" : isBreak ? "var(--surface-strong)" : "var(--hairline)",
                borderRadius: 999, minHeight: 28
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: isCurrent ? 700 : 500,
                  color: isBreak ? "var(--muted)" : "var(--ink)",
                  textDecoration: isBreak ? "none" : "none"
                }}>
                  {b.title}
                  {isCurrent && <span className="chip" style={{ marginLeft: 8, fontSize: 10, padding: "1px 8px", background: "var(--primary-disabled)", color: "var(--primary-active)" }}>NOW</span>}
                </div>
                <div className="t-mono muted" style={{ fontSize: 11, marginTop: 1 }}>
                  {isFocus ? "deep work · DND" : isMeeting ? "google meet" : isBreak ? "blocked" : "buffer"}
                </div>
              </div>
              {b.join && <Button variant="outline" size="xs" icon="video">Join</Button>}
            </div>);

        })}
      </div>
    </div>);

};

const InProgressTickets = ({ tickets }) =>
<div className="card" style={{ padding: "20px 22px" }}>
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 12 }}>
      <span className="t-title-md">In progress</span>
      <span className="t-caption muted" style={{ marginLeft: 8 }}>{tickets.length} tickets</span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {tickets.map((t) =>
    <div key={t.id} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 0", borderBottom: "1px solid var(--hairline-soft)"
    }}>
          <span className="t-mono" style={{
        fontSize: 11, fontWeight: 600,
        background: "var(--surface-strong)", color: "var(--body)",
        padding: "3px 8px", borderRadius: 6
      }}>{t.id}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
            <div className="t-mono muted" style={{ fontSize: 11, marginTop: 2 }}>
              {t.p} · {t.days}d in progress {t.pr && `· PR ${t.pr}`}
            </div>
          </div>
          <span className="dot dot-good" />
        </div>
    )}
    </div>
  </div>;


// ----- Pulse card (Direction D): donut + line + bars -----

const SOURCE_MIX = [
{ k: "GitHub", v: 38, c: "var(--src-git)" },
{ k: "Slack", v: 27, c: "var(--src-slack)" },
{ k: "Calendar", v: 18, c: "var(--src-cal)" },
{ k: "Linear", v: 12, c: "var(--src-task)" },
{ k: "AI", v: 5, c: "var(--src-ai)" }];

const REVIEW_LATENCY_HOURS = [9, 11, 7, 6, 8, 5, 4];
const SHIP_BY_DAY = [
{ d: "Mon", prs: 2, tickets: 1 },
{ d: "Tue", prs: 3, tickets: 1 },
{ d: "Wed", prs: 1, tickets: 0 },
{ d: "Thu", prs: 4, tickets: 2 },
{ d: "Fri", prs: 2, tickets: 0 }];


// Empty state shown inside a chart slot when there isn't enough data yet.
const ChartEmpty = ({ height = 90, label = "Not enough data yet", sub }) => (
  <div style={{
    height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    border: "1px dashed var(--hairline-soft)", borderRadius: 6,
    background: "repeating-linear-gradient(45deg, transparent 0 6px, var(--surface-soft) 6px 7px)",
    color: "var(--muted)", padding: "8px 12px", textAlign: "center", gap: 2,
  }}>
    <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)" }}>{label}</span>
    {sub && <span style={{ fontSize: 10.5, color: "var(--muted-soft)" }}>{sub}</span>}
  </div>
);

const PulseDonut = ({ data, size = 120 }) => {
  const total = (data || []).reduce((a, b) => a + b.v, 0);
  if (!total) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", border: "2px dashed var(--hairline-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-soft)", fontSize: 10, textAlign: "center", padding: 8 }}>
        No signals
      </div>
    );
  }
  const C = 2 * Math.PI * 44;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <g transform="translate(60 60) rotate(-90)">
        {data.map((d, i) => {
          const len = d.v / total * C;
          const el =
          <circle key={i} r="44" cx="0" cy="0" fill="none"
          stroke={d.c} strokeWidth="14"
          strokeDasharray={`${len} ${C - len}`}
          strokeDashoffset={-off} />;

          off += len;
          return el;
        })}
      </g>
      <text x="60" y="58" textAnchor="middle"
      style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, fill: "var(--ink)" }}>{total}</text>
      <text x="60" y="72" textAnchor="middle"
      style={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-soft)", letterSpacing: 0.3 }}>signals</text>
    </svg>);

};

const PulseLine = ({ values, w = 220, h = 90, color = "var(--primary)" }) => {
  if (!values || values.length < 2) {
    return <ChartEmpty height={h + 18} label="Not enough data" sub="Need at least 2 days of activity" />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - (v - min) / (max - min || 1) * (h - 16) - 8]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} width="100%" height={h + 18}>
      <line x1="0" x2={w} y1={h - 8} y2={h - 8} stroke="var(--hairline-soft)" strokeWidth="1" />
      <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) =>
      <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.5}
      fill={i === pts.length - 1 ? color : "var(--canvas)"}
      stroke={color} strokeWidth="1.5" />
      )}
      <text x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1] - 8} textAnchor="end"
      style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, fill: color }}>
        {values[values.length - 1]}h
      </text>
    </svg>);

};

const PulseBars = ({ data, h = 90 }) => {
  if (!data || !data.length || !data.some((d) => d.prs || d.tickets)) {
    return <ChartEmpty height={h + 22} label="Nothing shipped yet this week" sub="Bars will appear once a PR merges or a ticket closes" />;
  }
  const max = Math.max(...data.map((d) => Math.max(d.prs, d.tickets)));
  return (
    <svg viewBox={`0 0 240 ${h + 22}`} width="100%" height={h + 22}>
      {data.map((d, i) => {
        const x = 8 + i * 46;
        const ph = d.prs / max * h;
        const th = d.tickets / max * h;
        return (
          <g key={i}>
            <rect x={x} y={h - ph} width={16} height={ph} fill="var(--ink)" rx={2} />
            <rect x={x + 18} y={h - th} width={16} height={th} fill="var(--primary)" opacity={0.85} rx={2} />
            <text x={x + 17} y={h + 14} textAnchor="middle"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-soft)", letterSpacing: 0.3 }}>{d.d}</text>
          </g>);

      })}
    </svg>);

};

const WeekStats = ({ stats, empty }) => {
  const sourceMix    = empty ? [] : SOURCE_MIX;
  const reviewLatency = empty ? [] : REVIEW_LATENCY_HOURS;
  const shipByDay    = empty ? SHIP_BY_DAY.map((d) => ({ ...d, prs: 0, tickets: 0 })) : SHIP_BY_DAY;
  const total = sourceMix.reduce((a, b) => a + b.v, 0);
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
          <PulseDonut data={sourceMix} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sourceMix.length === 0 ?
              <span style={{ fontSize: 11, color: "var(--muted-soft)" }}>No signal mix yet</span> :
              sourceMix.map((s) =>
            <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, background: s.c, borderRadius: 2, display: "inline-block" }} />
                <span style={{ color: "var(--ink)", minWidth: 56 }}>{s.k}</span>
                <span className="t-mono muted">{s.v}</span>
              </div>
            )}
          </div>
        </div>
        {/* Line — review latency */}
        <div style={{ padding: "0 20px", borderRight: "1px solid var(--hairline-soft)" }}>
          <div className="t-mono muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Review latency</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>median time-to-first-comment, lower is better</div>
          <div style={{ marginTop: 8 }}><PulseLine values={reviewLatency} /></div>
          <div style={{ marginTop: 4, fontSize: 11, color: reviewLatency.length >= 2 ? "var(--good)" : "var(--muted-soft)", fontWeight: 500 }}>
            {reviewLatency.length >= 2 ? "↓ 5h faster than 7d ago" : "—"}
          </div>
        </div>
        {/* Bars — shipped */}
        <div style={{ paddingLeft: 20 }}>
          <div className="t-mono muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Shipped this week</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>PRs merged · Tickets closed</div>
          <div style={{ marginTop: 8 }}><PulseBars data={shipByDay} /></div>
          <div style={{ marginTop: 4, display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--ink)", borderRadius: 2, marginRight: 6 }} />{empty ? 0 : stats.prs_reviewed} PRs</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "var(--primary)", borderRadius: 2, marginRight: 6 }} />{empty ? 0 : stats.tickets_shipped} tickets</span>
          </div>
        </div>
      </div>
    </div>);

};

const TodayPage = ({ onOpenInbox, aiConnected, emptyCharts }) => {
  const aiOn = aiConnected !== undefined ? aiConnected : window.DevyData.AI_CONNECTED;
  const sigs = window.DevyData.SIGNALS;
  const nextUp = sigs.find((s) => s.id === "s1");
  const previewRows = sigs.filter((s) => s.requires_action && s.id !== "s1").slice(0, 6);

  // suppress briefing if a meeting is <10m away
  const minutesUntilNext = Math.max(0, Math.floor((new Date(nextUp.when).getTime() - Date.now()) / 60000));
  const meetingImminent = minutesUntilNext <= 10;

  return (
    <div style={{ padding: "32px 40px 64px", maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* greeting */}
      <header style={{ marginBottom: 4 }}>
        <div className="t-display-xl" style={{ letterSpacing: -0.6 }}>Good morning, Erin.</div>
        <div className="t-body muted" style={{ marginTop: 4 }}>
          5 things need you · 3 meetings today · quiet hours end at 09:00
        </div>
      </header>

      <WeekStats stats={window.DevyData.WEEK_STATS} empty={emptyCharts} />

      <NextUpHero signal={nextUp} />

      <BriefingCard
        data={window.DevyData.BRIEFING}
        suppressed={meetingImminent}
        aiConnected={aiOn}
        onConnect={() => window.dispatchEvent(new CustomEvent("devy:nav", { detail: { tab: "settings", panel: "ai" } }))} />

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        {/* Inbox preview */}
        <div className="card" style={{ padding: "20px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", padding: "0 6px", marginBottom: 8 }}>
            <span className="t-title-md">Needs you</span>
            <span className="t-caption muted" style={{ marginLeft: 8 }}>5 unread</span>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={onOpenInbox}>Open inbox</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {previewRows.map((s) => <InboxPreviewRow key={s.id} s={s} onOpen={onOpenInbox} />)}
          </div>
        </div>

        <InProgressTickets tickets={window.DevyData.IN_PROGRESS} />
      </div>

      <TodaySchedule schedule={window.DevyData.TODAY_SCHEDULE} />
    </div>);

};

window.TodayPage = TodayPage;
window.relAgo = relAgo;