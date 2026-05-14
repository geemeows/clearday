// Calendar page — week/day/month/agenda views, 24h scrollable timeline,
// per-account legend, click event → popover with notes + agenda CTAs.

const { useState: useState_c, useEffect: useEffect_c, useRef: useRef_c } = React;

// 24h timeline
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

// Read week start (from Settings)
const getWeekStart = () => {
  try { return localStorage.getItem("devy.weekStart") || "mon"; } catch { return "mon"; }
};
const DAY_SETS = {
  sun: { labels: ["Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8", "Sat 9"], todayIndex: 1, eventDayOffset: 1 },
  mon: { labels: ["Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"], todayIndex: 0, eventDayOffset: 0 },
  sat: { labels: ["Sat 2", "Sun 3", "Mon 4", "Tue 5", "Wed 6", "Thu 7", "Fri 8"], todayIndex: 2, eventDayOffset: 2 }
};

// Connected calendar accounts — match Settings → Integrations
const CAL_ACCOUNTS = [
  { id: "cal-work",     label: "erin@kovacs.dev",     short: "Work",     color: "#1d4ed8" },
  { id: "cal-personal", label: "erin@personal.com",   short: "Personal", color: "#0a8754" },
  { id: "cal-team",     label: "team.calendar (shared)", short: "Team",  color: "#9333ea" },
];

// events: { day, start, end, title, kind, account, location?, attendees?, notes?, agenda? }
const EVENTS = [
  // Monday (today)
  { id: "e1", day: 0, start: 9.0,   end: 9.75,  title: "Deep work — Slack adapter", kind: "focus", account: "cal-work" },
  { id: "e2", day: 0, start: 10.0,  end: 10.25, title: "Standup", kind: "meeting", account: "cal-work",
    attendees: ["Priya M.", "Joon K.", "Sam R.", "+ 3"], location: "https://meet.google.com/abc-defg-hij",
    agenda: "Round-robin: yesterday / today / blockers." },
  { id: "e3", day: 0, start: 11.0,  end: 11.5,  title: "1:1 — Maria", kind: "meeting", account: "cal-work",
    attendees: ["Maria L."], location: "https://meet.google.com/xyz-vwxy-zab",
    notes: "Career conversation continues — share L5 wheel snapshot." },
  { id: "e4", day: 0, start: 11.75, end: 13.0,  title: "Deep work — DEV-441", kind: "focus", account: "cal-work" },
  { id: "e5", day: 0, start: 13.0,  end: 14.0,  title: "Lunch w/ Alex", kind: "personal", account: "cal-personal",
    location: "Roma Caffè" },
  { id: "e6", day: 0, start: 14.0,  end: 14.75, title: "Design review — onboarding", kind: "meeting", account: "cal-team",
    attendees: ["Priya M.", "Joon K.", "Design team"], location: "https://meet.google.com/def-ghij-klm",
    agenda: "Walk through onboarding v3 hi-fi flow." },
  { id: "e7", day: 0, start: 15.0,  end: 16.5,  title: "Deep work — briefing prompt", kind: "focus", account: "cal-work" },
  { id: "e8", day: 0, start: 18.0,  end: 19.0,  title: "Gym", kind: "personal", account: "cal-personal" },
  // Tuesday — conflict
  { id: "e9",  day: 1, start: 10.0, end: 11.0,  title: "Sprint planning",  kind: "meeting", account: "cal-work",   conflict: true },
  { id: "e10", day: 1, start: 10.0, end: 10.5,  title: "1:1 — Joon",       kind: "meeting", account: "cal-work",   conflict: true,
    notes: "Re-schedule — conflicts with sprint planning." },
  { id: "e11", day: 1, start: 13.0, end: 14.5,  title: "Deep work — review queue", kind: "focus", account: "cal-work" },
  { id: "e12", day: 1, start: 15.0, end: 15.5,  title: "Office hours",     kind: "meeting", account: "cal-team" },
  // Wed
  { id: "e13", day: 2, start: 9.0,  end: 11.0,  title: "Deep work — quiet hours arc", kind: "focus", account: "cal-work" },
  { id: "e14", day: 2, start: 11.0, end: 11.5,  title: "Architecture sync", kind: "meeting", account: "cal-team" },
  { id: "e15", day: 2, start: 14.0, end: 15.0,  title: "Eng all-hands",     kind: "meeting", account: "cal-team" },
  { id: "e16", day: 2, start: 19.0, end: 20.0,  title: "Dinner",            kind: "personal", account: "cal-personal" },
  // Thu
  { id: "e17", day: 3, start: 9.0,  end: 9.25,  title: "Standup",            kind: "meeting", account: "cal-work" },
  { id: "e18", day: 3, start: 10.0, end: 12.0,  title: "Deep work",          kind: "focus",   account: "cal-work" },
  { id: "e19", day: 3, start: 14.0, end: 15.0,  title: "PR review window",   kind: "focus",   account: "cal-work" },
  // Fri
  { id: "e20", day: 4, start: 9.0,  end: 9.25,  title: "Standup",            kind: "meeting", account: "cal-work" },
  { id: "e21", day: 4, start: 11.0, end: 11.5,  title: "Demo",               kind: "meeting", account: "cal-team" },
  { id: "e22", day: 4, start: 14.0, end: 16.0,  title: "Deep work — ship",   kind: "focus",   account: "cal-work" },
];

const fmtH = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
};

// =====================================================
// Calendar page
// =====================================================
const CalendarPage = () => {
  const [view, setView] = useState_c("week");
  const [weekStart, setWeekStart] = useState_c(getWeekStart());
  const [selectedEvent, setSelectedEvent] = useState_c(null);
  const cfg = DAY_SETS[weekStart] || DAY_SETS.mon;
  const DAYS = cfg.labels;

  useEffect_c(() => {
    const onStorage = () => setWeekStart(getWeekStart());
    window.addEventListener("storage", onStorage);
    window.addEventListener("devy:weekStartChanged", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("devy:weekStartChanged", onStorage);
    };
  }, []);

  // header label depends on view
  const headerLabel = (
    view === "day"     ? "Mon, May 4 2026" :
    view === "month"   ? "May 2026" :
    view === "agenda"  ? "May 4 – 8, 2026" :
                         "May 4 – 8, 2026"
  );

  return (
    <div style={{ padding: "20px 32px 24px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h1 className="t-display-xl" style={{ margin: 0, letterSpacing: -0.6 }}>Calendar</h1>
        <span style={{ flex: 1 }} />
        <Button variant="outline" size="sm">Today</Button>
        <IconButton icon="chevron-left" label="Previous" size="sm" />
        <IconButton icon="chevron-right" label="Next" size="sm" />
        <div style={{ width: 1, height: 20, background: "var(--hairline)", margin: "0 4px" }} />
        <div style={{
          display: "inline-flex", padding: 2, gap: 0,
          background: "var(--surface-strong)", borderRadius: 999,
          border: "1px solid var(--border)",
        }}>
          {[["day","Day"],["week","Week"],["month","Month"],["agenda","Agenda"]].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "4px 12px", borderRadius: 999, border: "none",
              background: view === v ? "var(--background)" : "transparent",
              color:      view === v ? "var(--foreground)" : "var(--muted-foreground)",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* meta strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: "var(--foreground)" }}>{headerLabel}</span>
        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>3 conflicts · 14.5h focus scheduled</span>
        <span style={{ flex: 1 }} />
      </div>

      {/* Account legend — which event belongs to which connected account */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center",
        marginBottom: 12, padding: "10px 14px", borderRadius: "var(--radius-md)",
        background: "var(--surface-soft)", border: "1px solid var(--hairline)",
      }}>
        <span className="t-tag" style={{ fontSize: 9.5 }}>Accounts</span>
        {CAL_ACCOUNTS.map(a => (
          <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
            <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{a.short}</span>
            <span className="t-mono" style={{ color: "var(--muted-foreground)", fontSize: 10.5 }}>
              {a.label}
            </span>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span className="t-tag" style={{ fontSize: 9.5 }}>Kind</span>
        <KindLegend swatch="var(--foreground)" label="Focus" pattern="solid" />
        <KindLegend swatch="var(--surface-strong)" label="Meeting" pattern="outline" />
        <KindLegend swatch="repeating-linear-gradient(45deg, rgba(220,38,38,0.18) 0 6px, transparent 6px 10px)" label="Conflict" pattern="stripes" />
      </div>

      {view === "week"   && <WeekTimeline days={DAYS} todayIndex={cfg.todayIndex} eventDayOffset={cfg.eventDayOffset} onEventClick={setSelectedEvent} />}
      {view === "day"    && <DayTimeline onEventClick={setSelectedEvent} />}
      {view === "month"  && <MonthView />}
      {view === "agenda" && <AgendaView days={DAYS} eventDayOffset={cfg.eventDayOffset} onEventClick={setSelectedEvent} />}

      <EventDialog
        event={selectedEvent}
        onOpenChange={(v) => { if (!v) setSelectedEvent(null); }}
      />
    </div>
  );
};

const KindLegend = ({ swatch, label, pattern }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted-foreground)" }}>
    <span style={{
      width: 14, height: 12, borderRadius: 3,
      background: pattern === "outline" ? "transparent" : swatch,
      border: pattern === "outline" ? "1.5px solid var(--border-strong)" : "none",
      backgroundImage: pattern === "stripes" ? swatch : null,
    }} />
    {label}
  </span>
);

// =====================================================
// Week timeline — 24h scrollable, today indicator, click events
// =====================================================
const ROW_H = 44; // px per hour
const VISIBLE_H = 560; // viewport for scroll
const SCROLL_TO_HOUR = 7; // initial scroll target

function WeekTimeline({ days, todayIndex, eventDayOffset, onEventClick }) {
  const scrollRef = useRef_c(null);
  useEffect_c(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * ROW_H;
  }, []);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden",
      background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
      {/* sticky header row */}
      <div style={{
        display: "grid", gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
        borderBottom: "1px solid var(--hairline)", background: "var(--surface-card)",
      }}>
        <div />
        {days.map((d, i) => (
          <div key={d} style={{
            padding: "10px 14px", borderLeft: "1px solid var(--hairline-soft)",
            display: "flex", alignItems: "baseline", gap: 8,
            background: i === todayIndex ? "var(--primary-disabled)" : "transparent"
          }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>{d.split(" ")[0]}</span>
            <span style={{ fontSize: 17, fontWeight: 700,
              color: i === todayIndex ? "var(--primary-active)" : "var(--foreground)" }}>
              {d.split(" ")[1]}
            </span>
          </div>
        ))}
      </div>

      {/* scrollable body */}
      <div ref={scrollRef} style={{ height: VISIBLE_H, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${days.length}, 1fr)`, position: "relative" }}>
          {/* hours column */}
          <div style={{ borderRight: "1px solid var(--hairline-soft)" }}>
            {HOURS_24.map(h => (
              <div key={h} style={{ height: ROW_H, padding: "0 8px", textAlign: "right",
                borderTop: h === 0 ? "none" : "1px solid var(--hairline-soft)" }}>
                <span className="t-mono" style={{ fontSize: 10, color: "var(--muted-soft)",
                  transform: "translateY(-6px)", display: "inline-block" }}>
                  {String(h).padStart(2,"0")}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((d, di) => (
            <DayColumn key={d}
              isToday={di === todayIndex}
              events={EVENTS.filter(e => e.day + eventDayOffset === di)}
              onEventClick={onEventClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({ isToday, events, onEventClick, fullWidth }) {
  const totalH = HOURS_24.length * ROW_H;
  // pre-compute conflict pairs to keep layout simple
  return (
    <div style={{
      position: "relative", borderLeft: "1px solid var(--hairline-soft)",
      height: totalH, minWidth: 0,
    }}>
      {/* hour rules */}
      {HOURS_24.map((h, i) => (
        <div key={h} style={{
          height: ROW_H, borderTop: i === 0 ? "none" : "1px solid var(--hairline-soft)"
        }} />
      ))}
      {/* now-line */}
      {isToday && (
        <div style={{
          position: "absolute", left: 0, right: 0,
          top: (9 + 47/60) * ROW_H, height: 2, background: "var(--primary)", zIndex: 5,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)",
            position: "absolute", left: -4, top: -3 }} />
        </div>
      )}
      {/* events */}
      {events.map((e, i, arr) => {
        const top = e.start * ROW_H;
        const h = Math.max(20, (e.end - e.start) * ROW_H - 2);
        const acc = CAL_ACCOUNTS.find(a => a.id === e.account) || CAL_ACCOUNTS[0];
        const isFocus = e.kind === "focus";
        const isConflict = e.conflict;
        // split conflicting events side-by-side
        const conflicts = arr.filter(x => x.conflict && Math.abs(x.start - e.start) < 0.5);
        const ci = isConflict ? conflicts.findIndex(x => x.id === e.id) : 0;
        const cw = isConflict && conflicts.length > 1 ? `calc(${100 / conflicts.length}% - 5px)` : "calc(100% - 8px)";
        const cl = isConflict && conflicts.length > 1 ? `calc(${(100 / conflicts.length) * ci}% + 4px)` : 4;

        return (
          <button key={e.id} onClick={() => onEventClick?.(e)} style={{
            position: "absolute", top: top + 1, left: cl, width: cw, height: h,
            borderRadius: 8, padding: "5px 8px",
            background: isFocus ? acc.color : "var(--surface-card)",
            color: isFocus ? "white" : "var(--foreground)",
            border: isFocus ? "none" : `1px solid ${acc.color}`,
            boxShadow: isFocus ? "0 1px 2px rgba(0,0,0,.08)" : "none",
            cursor: "pointer", textAlign: "left",
            display: "flex", flexDirection: "column", overflow: "hidden",
            ...(isConflict && {
              backgroundImage: "repeating-linear-gradient(45deg, rgba(220,38,38,0.15) 0 6px, transparent 6px 10px)",
              outline: "1.5px solid var(--danger)", outlineOffset: -1,
            }),
          }}>
            {isConflict && conflicts.length > 1 && (
              <span style={{
                position: "absolute", top: 4, right: 4,
                padding: "1px 5px", borderRadius: 3, fontSize: 8.5, fontWeight: 700,
                letterSpacing: 0.4, textTransform: "uppercase",
                background: "var(--danger)", color: "white", lineHeight: 1,
              }}>
                Conflict {ci + 1}/{conflicts.length}
              </span>
            )}
            {/* account stripe */}
            {!isFocus && (
              <span style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                background: acc.color, borderRadius: "8px 0 0 8px",
              }} />
            )}
            <span style={{
              fontSize: 11.5, fontWeight: 600, lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              paddingLeft: isFocus ? 0 : 4,
              paddingRight: isConflict && conflicts.length > 1 ? 56 : 0,
            }}>{e.title}</span>
            <span className="t-mono" style={{ fontSize: 10, opacity: 0.75, marginTop: "auto",
              paddingLeft: isFocus ? 0 : 4 }}>
              {fmtH(e.start)}–{fmtH(e.end)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// =====================================================
// Day timeline — single column, wider
// =====================================================
function DayTimeline({ onEventClick }) {
  const scrollRef = useRef_c(null);
  useEffect_c(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * ROW_H;
  }, []);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden",
      background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
      <div ref={scrollRef} style={{ height: VISIBLE_H, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr" }}>
          <div style={{ borderRight: "1px solid var(--hairline-soft)" }}>
            {HOURS_24.map(h => (
              <div key={h} style={{ height: ROW_H, padding: "0 8px", textAlign: "right",
                borderTop: h === 0 ? "none" : "1px solid var(--hairline-soft)" }}>
                <span className="t-mono" style={{ fontSize: 10, color: "var(--muted-soft)",
                  transform: "translateY(-6px)", display: "inline-block" }}>
                  {String(h).padStart(2,"0")}:00
                </span>
              </div>
            ))}
          </div>
          <DayColumn isToday={true} events={EVENTS.filter(e => e.day === 0)} onEventClick={onEventClick} />
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Month — grid placeholder with event chips
// =====================================================
function MonthView() {
  const cells = Array.from({ length: 35 });
  const eventsByDay = { 4: ["Standup","1:1","Deep work"], 5: ["Sprint","1:1"], 6: ["Sync","All-hands"], 7: ["PR review"], 8: ["Standup","Demo"] };
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        borderBottom: "1px solid var(--hairline)", background: "var(--surface-soft)" }}>
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
          <div key={d} style={{ padding: "8px 12px", borderLeft: "1px solid var(--hairline-soft)" }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>{d}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: 96 }}>
        {cells.map((_, i) => {
          const dayNum = i - 2; // start May 1 on Wed
          const inMonth = dayNum >= 1 && dayNum <= 31;
          const isToday = dayNum === 4;
          const events = eventsByDay[dayNum] || [];
          return (
            <div key={i} style={{
              padding: "6px 8px", borderTop: "1px solid var(--hairline-soft)",
              borderLeft: "1px solid var(--hairline-soft)",
              background: isToday ? "var(--accent-tint)" : "var(--surface-card)",
              opacity: inMonth ? 1 : 0.35,
            }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500,
                color: isToday ? "var(--primary)" : "var(--foreground)" }}>
                {inMonth ? dayNum : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 3 }}>
                {events.slice(0,3).map((t, k) => (
                  <span key={k} style={{
                    fontSize: 10, padding: "1px 5px", borderRadius: 3,
                    background: "var(--surface-strong)", color: "var(--foreground)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{t}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================
// Agenda view — flat list of next events
// =====================================================
function AgendaView({ days, eventDayOffset, onEventClick }) {
  const grouped = days.map((dlabel, di) => ({
    label: dlabel,
    events: EVENTS.filter(e => e.day + eventDayOffset === di).sort((a,b) => a.start - b.start),
  }));
  return (
    <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {grouped.map((g, i) => (
        <div key={g.label} style={{ borderTop: i ? "1px solid var(--hairline)" : "none" }}>
          <div style={{ padding: "10px 16px", background: "var(--surface-soft)" }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>{g.label}</span>
            <span style={{ marginLeft: 8, fontSize: 11.5, color: "var(--muted-foreground)" }}>
              {g.events.length} events
            </span>
          </div>
          {g.events.map(e => {
            const acc = CAL_ACCOUNTS.find(a => a.id === e.account) || CAL_ACCOUNTS[0];
            return (
              <button key={e.id} onClick={() => onEventClick?.(e)} style={{
                display: "grid", gridTemplateColumns: "120px auto 1fr auto", gap: 12, alignItems: "center",
                width: "100%", padding: "10px 16px", textAlign: "left", border: "none",
                background: "transparent", cursor: "pointer",
                borderTop: "1px solid var(--hairline-soft)",
              }} onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"}
                 onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span className="t-mono" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {fmtH(e.start)} – {fmtH(e.end)}
                </span>
                <span style={{ width: 4, height: 22, borderRadius: 2, background: acc.color }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--foreground)" }}>{e.title}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{acc.short}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// =====================================================
// Event popover dialog — Google-Cal-style: details + notes + 2 CTAs
// =====================================================
function EventDialog({ event, onOpenChange }) {
  const [notes, setNotes] = useState_c("");
  const [agendaPrivate, setAgendaPrivate] = useState_c(false);
  useEffect_c(() => { if (event) { setNotes(event.notes || ""); setAgendaPrivate(false); } }, [event]);
  if (!event) return null;
  const acc = CAL_ACCOUNTS.find(a => a.id === event.account) || CAL_ACCOUNTS[0];
  const isFocus = event.kind === "focus";

  return (
    <Dialog open={!!event} onOpenChange={onOpenChange} width={560}>
      <div style={{
        padding: "16px 20px 14px", display: "flex", alignItems: "start", gap: 12,
        borderBottom: "1px solid var(--hairline)",
      }}>
        <span style={{
          width: 12, height: 36, borderRadius: 3, background: acc.color, marginTop: 3,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", letterSpacing: -0.2 }}>
            {event.title}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2 }}>
            {DAY_SETS.mon.labels[event.day]} · {fmtH(event.start)} – {fmtH(event.end)} ·{" "}
            <span style={{ color: "var(--foreground)" }}>{acc.short}</span>{" "}
            <span className="t-mono" style={{ fontSize: 11, color: "var(--muted-soft)" }}>({acc.label})</span>
          </div>
        </div>
        <IconButton icon="x" label="Close" size="sm" onClick={() => onOpenChange(false)} />
      </div>

      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {event.location && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Icon name={event.location.startsWith("http") ? "video" : "map-pin"} size={14} />
            <a href={event.location} target="_blank" rel="noreferrer" style={{
              color: "var(--primary)", textDecoration: "none",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            }}>{event.location}</a>
            <Button variant="outline" size="sm" icon="copy">Copy link</Button>
          </div>
        )}

        {event.attendees && event.attendees.length > 0 && (
          <div style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 13 }}>
            <Icon name="users" size={14} style={{ marginTop: 3 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: "var(--foreground)" }}>
                {event.attendees.length} attendees
              </div>
              <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {event.attendees.map((n, i) => (
                  <span key={i} style={{
                    fontSize: 11.5, padding: "2px 8px", borderRadius: 999,
                    background: "var(--surface-strong)", border: "1px solid var(--hairline)",
                    color: "var(--foreground)",
                  }}>{n}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Agenda (if any) */}
        {event.agenda && (
          <div style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 13 }}>
            <Icon name="list" size={14} style={{ marginTop: 3 }} />
            <div style={{ flex: 1 }}>
              <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 4 }}>Agenda</div>
              <div style={{ color: "var(--body)", lineHeight: 1.5 }}>{event.agenda}</div>
            </div>
          </div>
        )}

        {/* Notes (always editable; private by default) */}
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Icon name="sticky-note" size={13} />
            <span className="t-tag" style={{ fontSize: 9.5 }}>Notes</span>
            <span style={{ flex: 1 }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11.5, color: "var(--muted-foreground)", cursor: "pointer" }}>
              <input type="checkbox" checked={agendaPrivate} onChange={e => setAgendaPrivate(e.target.checked)} />
              Visible to me only
            </label>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Talking points, prep, follow-ups…"
            rows={4}
            style={{
              width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5,
              fontFamily: "inherit", color: "var(--foreground)",
              background: "var(--background)", border: "1px solid var(--input)",
              borderRadius: "var(--radius-md)", outline: "none", resize: "vertical",
            }}
          />
        </div>

        {/* Footer CTAs */}
        <div style={{
          marginTop: 6, padding: "10px 0 0", borderTop: "1px solid var(--hairline-soft)",
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <Button variant="outline" size="md" icon="external-link"
            onClick={() => event.location && window.open(event.location, "_blank")}>
            Open in Google Calendar
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="primary" size="md" icon="send" disabled={isFocus}>
            Update meeting agenda
          </Button>
        </div>
        {isFocus && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", textAlign: "right" }}>
            Focus blocks don't have shared agendas — notes stay on your end.
          </div>
        )}
      </div>
    </Dialog>
  );
}

window.CalendarPage = CalendarPage;
