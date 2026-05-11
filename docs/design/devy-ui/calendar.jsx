// Calendar page — week view with conflict + focus blocks

const { useState: useState_c } = React;

const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8 → 18
// Read week start from localStorage (set by Settings → Calendar → Week start)
const getWeekStart = () => {
  try { return localStorage.getItem("devy.weekStart") || "mon"; } catch { return "mon"; }
};

// Day labels keyed by week start. The "today" highlight follows the same key.
const DAY_SETS = {
  sun: { labels: ["Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8", "Sat 9"], todayIndex: 1, eventDayOffset: 1 },
  mon: { labels: ["Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"], todayIndex: 0, eventDayOffset: 0 },
  sat: { labels: ["Sat 2", "Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"], todayIndex: 2, eventDayOffset: 2 },
};

// events: { day: 0-4, start: float hours, end: float hours, title, kind, conflict? }
const EVENTS = [
  // Monday (today)
  { day: 0, start: 9.0, end: 9.75, title: "Deep work — Slack adapter", kind: "focus" },
  { day: 0, start: 10.0, end: 10.25, title: "Standup", kind: "meeting" },
  { day: 0, start: 11.0, end: 11.5, title: "1:1 — Maria", kind: "meeting" },
  { day: 0, start: 11.75, end: 13.0, title: "Deep work — DEV-441", kind: "focus" },
  { day: 0, start: 13.0, end: 14.0, title: "Lunch", kind: "break" },
  { day: 0, start: 14.0, end: 14.75, title: "Design review — onboarding", kind: "meeting" },
  { day: 0, start: 15.0, end: 16.5, title: "Deep work — briefing prompt", kind: "focus" },
  // Tuesday — conflict
  { day: 1, start: 10.0, end: 11.0, title: "Sprint planning", kind: "meeting", conflict: true },
  { day: 1, start: 10.0, end: 10.5, title: "1:1 — Joon", kind: "meeting", conflict: true },
  { day: 1, start: 13.0, end: 14.5, title: "Deep work — review queue", kind: "focus" },
  { day: 1, start: 15.0, end: 15.5, title: "Office hours", kind: "meeting" },
  // Wed
  { day: 2, start: 9.0, end: 11.0, title: "Deep work — quiet hours arc", kind: "focus" },
  { day: 2, start: 11.0, end: 11.5, title: "Architecture sync", kind: "meeting" },
  { day: 2, start: 14.0, end: 15.0, title: "Eng all-hands", kind: "meeting" },
  // Thu
  { day: 3, start: 9.0, end: 9.25, title: "Standup", kind: "meeting" },
  { day: 3, start: 10.0, end: 12.0, title: "Deep work", kind: "focus" },
  { day: 3, start: 14.0, end: 15.0, title: "PR review window", kind: "focus" },
  // Fri
  { day: 4, start: 9.0, end: 9.25, title: "Standup", kind: "meeting" },
  { day: 4, start: 11.0, end: 11.5, title: "Demo", kind: "meeting" },
  { day: 4, start: 14.0, end: 16.0, title: "Deep work — ship", kind: "focus" },
];

const CalendarPage = () => {
  const [view, setView] = useState_c("week");
  const [weekStart, setWeekStart] = useState_c(getWeekStart());
  const cfg = DAY_SETS[weekStart] || DAY_SETS.mon;
  const DAYS = cfg.labels;

  // listen for settings changes
  React.useEffect(() => {
    const onStorage = () => setWeekStart(getWeekStart());
    window.addEventListener("storage", onStorage);
    window.addEventListener("devy:weekStartChanged", onStorage);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("devy:weekStartChanged", onStorage); };
  }, []);

  return (
    <div style={{ padding: "28px 36px 48px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <h1 className="t-display-xl" style={{ margin: 0, letterSpacing: -0.6 }}>Calendar</h1>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, padding: 3, background: "var(--surface-strong)", borderRadius: 999 }}>
          {["day", "week", "month"].map(v => (
            <button key={v} onClick={() => setView(v)} className={`chip ${view===v?"chip-active":""}`} style={{ border: "none", textTransform: "capitalize", fontSize: 12, padding: "5px 14px", background: view===v ? "var(--canvas)" : "transparent", color: view===v ? "var(--ink)" : "var(--muted)" }}>{v}</button>
          ))}
        </div>
      </div>

      {/* week label */}
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16, gap: 12 }}>
        <span className="t-display-md">May 4 – 8, 2026</span>
        <span className="t-caption muted">3 conflicts · 14.5h focus scheduled</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm">Today</Button>
        <IconButton icon="chevron-left" aria-label="prev" />
        <IconButton icon="chevron-right" aria-label="next" />
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 18, marginBottom: 12, alignItems: "center" }}>
        <Legend swatch="var(--ink)" label="Focus" />
        <Legend swatch="var(--primary)" label="Meeting" />
        <Legend swatch="var(--surface-strong)" label="Break" />
        <Legend swatch="repeating-linear-gradient(45deg, var(--danger-soft), var(--danger-soft) 4px, transparent 4px, transparent 8px)" label="Conflict" />
      </div>

      <CalendarGrid days={DAYS} todayIndex={cfg.todayIndex} eventDayOffset={cfg.eventDayOffset} />
    </div>
  );
};

const Legend = ({ swatch, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span style={{ width: 14, height: 14, background: swatch, borderRadius: 3, border: "1px solid var(--hairline-soft)" }} />
    <span className="t-mono muted" style={{ fontSize: 11 }}>{label}</span>
  </div>
);

const CalendarGrid = ({ days, todayIndex, eventDayOffset }) => {
  const ROW_H = 48; // px per hour
  const TOTAL_H = HOURS.length * ROW_H;
  const DAYS = days;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* header row */}
      <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${DAYS.length}, 1fr)`, borderBottom: "1px solid var(--hairline-soft)" }}>
        <div />
        {DAYS.map((d, i) => (
          <div key={d} style={{
            padding: "12px 14px", borderLeft: "1px solid var(--hairline-soft)",
            display: "flex", alignItems: "baseline", gap: 8,
            background: i === todayIndex ? "var(--primary-disabled)" : "transparent",
          }}>
            <span className="t-tag muted">{d.split(" ")[0]}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: i === todayIndex ? "var(--primary-active)" : "var(--ink)" }}>{d.split(" ")[1]}</span>
          </div>
        ))}
      </div>

      {/* body */}
      <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${DAYS.length}, 1fr)`, position: "relative" }}>
        {/* hours column */}
        <div style={{ borderRight: "1px solid var(--hairline-soft)" }}>
          {HOURS.map(h => (
            <div key={h} style={{ height: ROW_H, padding: "0 8px", textAlign: "right", borderTop: "1px solid var(--hairline-soft)" }}>
              <span className="t-mono muted" style={{ fontSize: 10, transform: "translateY(-6px)", display: "inline-block" }}>{h}:00</span>
            </div>
          ))}
        </div>

        {DAYS.map((d, di) => (
          <div key={d} style={{ position: "relative", borderLeft: di === 0 ? "none" : "1px solid var(--hairline-soft)", height: TOTAL_H }}>
            {HOURS.map((h, hi) => (
              <div key={h} style={{ height: ROW_H, borderTop: hi === 0 ? "none" : "1px solid var(--hairline-soft)" }} />
            ))}
            {di === todayIndex && (
              <div style={{
                position: "absolute", left: 0, right: 0,
                top: ((9 + 47/60) - HOURS[0]) * ROW_H, height: 2, background: "var(--primary)",
                zIndex: 5,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", position: "absolute", left: -4, top: -3 }} />
              </div>
            )}
            {EVENTS.filter(e => e.day + eventDayOffset === di).map((e, i) => {
              const top = (e.start - HOURS[0]) * ROW_H;
              const h = (e.end - e.start) * ROW_H;
              const isFocus = e.kind === "focus";
              const isMeeting = e.kind === "meeting";
              const conflict = e.conflict;
              return (
                <div key={i} style={{
                  position: "absolute",
                  top: top + 1, left: conflict && i % 2 === 0 ? 4 : conflict ? "50%" : 4,
                  width: conflict ? "calc(50% - 6px)" : "calc(100% - 8px)",
                  height: h - 2,
                  borderRadius: 8, padding: "5px 8px",
                  background: isFocus ? "var(--ink)" : isMeeting ? "var(--primary)" : "var(--surface-strong)",
                  color: isFocus || isMeeting ? "white" : "var(--muted)",
                  border: conflict ? "1px solid var(--danger)" : "none",
                  fontSize: 11, fontWeight: 600, lineHeight: 1.2,
                  overflow: "hidden", cursor: "pointer",
                  display: "flex", flexDirection: "column",
                  ...(conflict && { backgroundImage: "repeating-linear-gradient(45deg, rgba(193,53,21,0.08) 0 6px, transparent 6px 10px)" }),
                }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 500, opacity: 0.75, marginTop: "auto" }}>
                    {fmtH(e.start)}–{fmtH(e.end)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* conflict notice */}
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--hairline-soft)", background: "var(--danger-soft)", color: "var(--danger)", display: "flex", alignItems: "center", gap: 12 }}>
        <span className="t-tag" style={{ background: "var(--danger)", color: "white", padding: "3px 7px", borderRadius: 4 }}>CONFLICT</span>
        <span style={{ fontSize: 13, color: "var(--ink)" }}>
          <strong style={{ fontWeight: 600 }}>Tue · 10:00</strong>  ·  Sprint planning overlaps 1:1 with Joon
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm">Decline 1:1</Button>
        <Button variant="secondary" size="sm">Reschedule</Button>
      </div>
    </div>
  );
};

const fmtH = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2,"0")}`;
};

window.CalendarPage = CalendarPage;
