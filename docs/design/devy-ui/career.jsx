// Devy — Career page (active level: tree + wheel, header, sync, share, archive, empty)
// All sub-components inline to keep the surface in one file.

const { useState: useCar, useMemo: useCarMemo, useEffect: useCarEffect, useRef: useCarRef } = React;

// ============================================================
// Score input controls — two variants exposed via Tweaks
// ============================================================
function ScoreDots({ value, max = 4, onChange, readOnly }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
         role="radiogroup" aria-label="Score">
      {Array.from({ length: max + 1 }).map((_, i) => {
        const filled = i <= value;
        return (
          <button key={i}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(i)}
            aria-checked={value === i} role="radio"
            title={window.CareerData.CAREER_LEGEND[i]}
            style={{
              width: 11, height: 11, borderRadius: "50%",
              border: filled ? "1px solid var(--primary)" : "1px solid var(--border-strong)",
              background: filled ? "var(--primary)" : "transparent",
              padding: 0, cursor: readOnly ? "default" : "pointer",
              transition: "all 80ms",
            }} />
        );
      })}
      <span className="t-mono" style={{ marginLeft: 6, color: "var(--muted-foreground)", minWidth: 26 }}>
        {value}/{max}
      </span>
    </div>
  );
}

function ScoreChips({ value, max = 4, onChange, readOnly }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 0, padding: 2,
                  background: "var(--surface-strong)", borderRadius: 999,
                  border: "1px solid var(--border)" }}
         role="radiogroup" aria-label="Score">
      {Array.from({ length: max + 1 }).map((_, i) => {
        const active = i === value;
        return (
          <button key={i}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(i)}
            aria-checked={active} role="radio"
            title={window.CareerData.CAREER_LEGEND[i]}
            style={{
              minWidth: 22, height: 22, padding: "0 6px",
              borderRadius: 999, border: "none",
              background: active ? "var(--primary)" : "transparent",
              color: active ? "var(--primary-foreground)" : "var(--muted-foreground)",
              fontSize: 11, fontWeight: 600, cursor: readOnly ? "default" : "pointer",
              transition: "all 80ms",
            }}>
            {i}
          </button>
        );
      })}
    </div>
  );
}

function ScoreControl({ value, onChange, mode = "dots", readOnly }) {
  return mode === "chips"
    ? <ScoreChips value={value} onChange={onChange} readOnly={readOnly} />
    : <ScoreDots  value={value} onChange={onChange} readOnly={readOnly} />;
}

// ============================================================
// Evidence chip
// ============================================================
function EvidenceChip({ ev, readOnly }) {
  return (
    <a href={ev.url || "#"} onClick={e => !ev.url && e.preventDefault()}
       style={{
         display: "inline-flex", alignItems: "center", gap: 5,
         padding: "2px 7px 2px 6px", borderRadius: 999,
         background: "var(--surface-strong)", border: "1px solid var(--hairline)",
         color: "var(--foreground)", fontSize: 11.5, fontWeight: 500,
         textDecoration: "none", maxWidth: 240,
       }}
       title={ev.title}>
      <Icon name={ev.card_id ? "layout-grid" : "link-2"} size={11} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
    </a>
  );
}

// ============================================================
// Indicator row (the workhorse)
// ============================================================
function IndicatorRow({ ind, scoreMode, readOnly }) {
  const [score, setScore] = useCar(ind.score);
  const [open, setOpen] = useCar(false);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14,
      padding: "10px 14px 10px 8px",
      borderTop: "1px solid var(--hairline-soft)",
      alignItems: "start",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2 }}>
        {!readOnly && (
          <button title="Drag to reorder" style={{
            width: 16, height: 16, padding: 0, border: "none", background: "transparent",
            color: "var(--muted-soft)", cursor: "grab", opacity: 0.7,
          }}>
            <Icon name="grip-vertical" size={14} />
          </button>
        )}
        <span className="t-mono" style={{
          padding: "1px 6px", borderRadius: 4,
          background: "var(--surface-strong)", color: "var(--muted-foreground)",
          fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
        }}>{ind.code}</span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.45, textWrap: "pretty" }}>
          {ind.description}
        </div>
        {(ind.notes || ind.evidence.length > 0) && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {ind.evidence.map(ev => <EvidenceChip key={ev.id} ev={ev} readOnly={readOnly} />)}
            {!readOnly && (
              <button onClick={() => setOpen(o=>!o)} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 7px 2px 6px", borderRadius: 999,
                background: "transparent", border: "1px dashed var(--border-strong)",
                color: "var(--muted-foreground)", fontSize: 11.5, cursor: "pointer",
              }}>
                <Icon name="plus" size={11} /> Evidence
              </button>
            )}
            {ind.notes && (
              <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontStyle: "italic", marginLeft: 2 }}>
                — {ind.notes}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ paddingTop: 1 }}>
        <ScoreControl value={score} onChange={setScore} mode={scoreMode} readOnly={readOnly} />
      </div>
    </div>
  );
}

// ============================================================
// Criterion section (header + indicator rows)
// ============================================================
function CriterionSection({ cr, letter, scoreMode, readOnly, sat }) {
  const summary = sat && sat[cr.id];
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        padding: "6px 8px", borderBottom: "1px solid var(--hairline-soft)",
      }}>
        <span style={{
          width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-strong)", borderRadius: 4,
          fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)",
        }}>{letter}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>{cr.name}</span>
        {summary && (
          <span className="t-mono" style={{
            fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)",
            padding: "1px 6px", borderRadius: 4, background: "var(--surface-strong)",
            border: "1px solid var(--hairline)",
          }}>
            {summary.avg.toFixed(1)} <span style={{ color: "var(--muted-soft)" }}>/ {cr.target}</span>
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!readOnly && (
          <button style={{
            border: "none", background: "transparent", color: "var(--muted-foreground)",
            fontSize: 12, cursor: "pointer", padding: "2px 6px", borderRadius: 4,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <Icon name="plus" size={12} /> Indicator
          </button>
        )}
      </div>
      <div>
        {cr.indicators.map(ind => (
          <IndicatorRow key={ind.id} ind={ind} scoreMode={scoreMode} readOnly={readOnly} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Competency block
// ============================================================
function CompetencyBlock({ comp, scoreMode, readOnly, sat }) {
  return (
    <section style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", marginBottom: 14, overflow: "hidden",
    }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid var(--hairline)",
        background: "linear-gradient(180deg, var(--surface-soft) 0%, var(--surface-card) 100%)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          background: "var(--primary)", color: "var(--primary-foreground)",
          fontSize: 13, fontWeight: 700,
        }}>{comp.name[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)" }}>{comp.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>
            {comp.criteria.length} criteria · {comp.criteria.reduce((s,c)=>s+c.indicators.length,0)} indicators
          </div>
        </div>
        {!readOnly && (
          <button style={{
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", fontSize: 12, cursor: "pointer", padding: "5px 10px",
            borderRadius: "var(--radius-sm)", display: "inline-flex", alignItems: "center", gap: 5,
          }}>
            <Icon name="plus" size={12} /> Criterion
          </button>
        )}
      </header>
      <div style={{ padding: "0 4px 14px" }}>
        {comp.criteria.map((cr, i) => (
          <CriterionSection
            key={cr.id} cr={cr}
            letter={String.fromCharCode(65 + i)}
            scoreMode={scoreMode} readOnly={readOnly} sat={sat} />
        ))}
      </div>
    </section>
  );
}

// ============================================================
// Header KV strip
// ============================================================
function HeaderKVs({ kvs, readOnly }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 1, background: "var(--border)",
      border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden",
    }}>
      {kvs.map((kv, i) => (
        <div key={i} style={{ background: "var(--surface-card)", padding: "10px 14px" }}>
          <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 3 }}>{kv.key}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{kv.value}</div>
        </div>
      ))}
      {!readOnly && (
        <button style={{
          background: "var(--surface-card)", padding: "10px 14px", border: "none",
          textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
          gap: 6, color: "var(--muted-foreground)", fontSize: 12,
        }}>
          <Icon name="plus" size={12} /> Add field
        </button>
      )}
    </div>
  );
}

// ============================================================
// Level switcher (dropdown in header)
// ============================================================
function LevelSwitcher({ active, archived, onPickArchived, onNewLevel }) {
  const [open, setOpen] = useCar(false);
  const ref = useCarRef(null);
  useCarEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o=>!o)} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 12px", borderRadius: "var(--radius-md)",
        background: "var(--surface-card)", border: "1px solid var(--border)",
        color: "var(--foreground)", cursor: "pointer",
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>{active.title.split("·")[0].trim()}</span>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500 }}>
          {active.title.split("·").slice(1).join("·").trim()}
        </span>
        <span style={{
          marginLeft: 6, padding: "1px 7px", borderRadius: 999,
          background: "var(--good-soft)", color: "var(--good)",
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
        }}>Active</span>
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
          width: 320, background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4,
        }}>
          <div className="t-tag" style={{ padding: "8px 10px 4px" }}>Active</div>
          <div style={{ padding: "8px 10px", borderRadius: 6, background: "var(--accent-tint)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{active.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Started {active.created_at}</div>
          </div>
          <div className="t-tag" style={{ padding: "12px 10px 4px" }}>Archive</div>
          {archived.map(a => (
            <button key={a.id} onClick={() => { setOpen(false); onPickArchived?.(a); }} style={{
              display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
              padding: "8px 10px", borderRadius: 6, cursor: "pointer",
            }} onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"}
               onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                Archived {a.archived_at} · avg {a.summary.current_avg}
              </div>
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 4, paddingTop: 4 }}>
            <button onClick={() => { setOpen(false); onNewLevel?.(); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
              borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
              color: "var(--primary)", fontSize: 13, fontWeight: 500,
            }} onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"}
               onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <Icon name="plus" size={13} /> New blank level…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sync pill (shows status; click → sync menu)
// ============================================================
function SyncPill({ level, onOpenSync }) {
  const linked = !!level.sheet_id;
  return (
    <button onClick={onOpenSync} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 10px 5px 8px", borderRadius: 999,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      cursor: "pointer", color: "var(--foreground)",
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        background: "#0F9D58", color: "white", fontSize: 11, fontWeight: 700,
      }}>S</span>
      {linked ? (
        <>
          <span style={{ fontSize: 12.5 }}>Synced <span style={{ color: "var(--muted-foreground)" }}>{level.last_synced_at}</span></span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            color: "var(--primary)", fontWeight: 600, fontSize: 12.5,
            paddingLeft: 6, borderLeft: "1px solid var(--hairline)",
          }}>
            <Icon name="refresh-cw" size={11} /> Sync now
          </span>
        </>
      ) : (
        <span style={{ fontSize: 12.5, color: "var(--primary)", fontWeight: 600 }}>
          Sync to Google Sheet
        </span>
      )}
    </button>
  );
}

// ============================================================
// Actions menu (… button)
// ============================================================
function ActionsMenu({ onShare, onArchive, onClone, onUnlink }) {
  const [open, setOpen] = useCar(false);
  const ref = useCarRef(null);
  useCarEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const item = (icon, label, action, danger) => (
    <button onClick={() => { setOpen(false); action?.(); }} style={{
      display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px",
      borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
      color: danger ? "var(--danger)" : "var(--foreground)", fontSize: 13, textAlign: "left",
    }} onMouseEnter={e=>e.currentTarget.style.background="var(--accent)"}
       onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <Icon name={icon} size={13} /> {label}
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconButton icon="more-horizontal" label="Level actions" onClick={()=>setOpen(o=>!o)} />
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
          minWidth: 220, background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4,
        }}>
          {item("share-2", "Generate share link", onShare)}
          {item("copy", "Clone as starting template", onClone)}
          {item("archive", "Archive this level", onArchive)}
          {item("unlink", "Unlink Google Sheet", onUnlink, true)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sync dialog (covers first-sync, re-sync, error)
// ============================================================
function SyncDialog({ open, onOpenChange, level, mode = "resync" }) {
  // mode: "first" | "resync" | "error"
  const [phase, setPhase] = useCar("idle"); // idle | running | done | error
  useCarEffect(() => { if (open) setPhase(mode === "error" ? "error" : "idle"); }, [open, mode]);
  const run = () => { setPhase("running"); setTimeout(() => setPhase("done"), 1100); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
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
        <div style={{ flex: 1 }}>
          <DialogTitle>
            {mode === "first" ? "Push to a new Google Sheet" :
             mode === "error" ? "Sync didn't finish" :
             "Sync to Google Sheet"}
          </DialogTitle>
          <DialogDescription>
            {mode === "first"
              ? "We'll create a new sheet in your Drive and write a Report tab + a Wheel chart. The link will be saved to this level."
              : "We'll clear and rewrite the Report and Wheel tabs of the linked sheet. Other tabs stay untouched."}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        {phase === "error" && (
          <div style={{
            display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--danger-soft)", border: "1px solid var(--danger)",
            color: "var(--danger)", fontSize: 12.5,
          }}>
            <Icon name="alert-circle" size={16} />
            <div>
              <div style={{ fontWeight: 600 }}>Network failure mid-sync</div>
              <div>The linked sheet wasn't modified. Retry when you're back online.</div>
            </div>
          </div>
        )}

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8,
        }}>
          <div style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            padding: "10px 12px", background: "var(--surface-soft)",
          }}>
            <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 4 }}>Will write</div>
            <div style={{ fontSize: 13, color: "var(--foreground)", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="file-text" size={12} /> Report tab
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="pie-chart" size={12} /> Wheel tab (with chart)
              </span>
            </div>
          </div>
          <div style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            padding: "10px 12px", background: "var(--surface-soft)",
          }}>
            <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 4 }}>Linked sheet</div>
            {mode === "first" ? (
              <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                None yet — we'll create one in your Drive.
              </div>
            ) : (
              <a href={level.sheet_url} style={{
                fontSize: 12.5, color: "var(--primary)", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
              }}>
                <Icon name="external-link" size={11} /> {level.title} · sheet
              </a>
            )}
          </div>
        </div>

        <div style={{
          marginTop: 10, padding: "9px 12px", borderRadius: "var(--radius-md)",
          background: "var(--surface-strong)", border: "1px solid var(--hairline)",
          fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="lock" size={12} /> One-way: Sheet → Devy edits don't flow back.
        </div>
      </DialogBody>
      <DialogFooter>
        {phase === "done" ? (
          <>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--good)", fontWeight: 600,
                           display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="check-circle-2" size={14} /> Synced. Sheet is up to date.
            </span>
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="primary" size="md" icon="external-link" onClick={() => onOpenChange(false)}>Open sheet</Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)} disabled={phase==="running"}>Cancel</Button>
            <Button variant="primary" size="md"
              icon={phase === "running" ? "loader-2" : (mode === "first" ? "send" : "refresh-cw")}
              onClick={run} disabled={phase==="running"}>
              {phase === "running" ? "Writing…" : (mode === "first" ? "Create & sync" : (mode === "error" ? "Retry sync" : "Sync now"))}
            </Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}

// ============================================================
// Share link dialog
// ============================================================
function ShareDialog({ open, onOpenChange, level, onRevoke, onGenerate }) {
  const [copied, setCopied] = useCar(false);
  const url = level.share_token ? `https://devy.app/career/share/${level.share_token}` : null;
  const copy = () => {
    navigator.clipboard?.writeText(url || "").catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 1400);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={()=>onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)",
        }}>
          <Icon name="share-2" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Share with a manager</DialogTitle>
          <DialogDescription>
            Read-only view of this level. Anyone with the link can open it — no Devy account needed.
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        {url ? (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: "var(--radius-md)",
              background: "var(--surface-strong)", border: "1px solid var(--border)",
            }}>
              <Icon name="link-2" size={14} />
              <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12,
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {url}
              </code>
              <Button variant="outline" size="sm" icon={copied ? "check" : "copy"} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10,
            }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 3 }}>Recipient sees</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--foreground)" }}>
                  Tree + wheel, read-only. No Devy chrome, no edit affordances.
                </div>
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 3 }}>Recipient cannot</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--foreground)" }}>
                  Comment, edit, or see your other levels.
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{
            padding: "16px", borderRadius: "var(--radius-md)",
            background: "var(--surface-soft)", border: "1px dashed var(--border)",
            textAlign: "center", color: "var(--muted-foreground)", fontSize: 12.5,
          }}>
            No link yet. Generate one to share this level.
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        {url ? (
          <>
            <Button variant="outline" size="md" icon="x-circle" onClick={onRevoke}>Revoke link</Button>
            <span style={{ flex: 1 }} />
            <Button variant="outline" size="md" icon="eye" onClick={()=>window.open(url, "_blank")}>Preview</Button>
            <Button variant="primary" size="md" onClick={()=>onOpenChange(false)}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="md" onClick={()=>onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" size="md" icon="share-2" onClick={onGenerate}>Generate share link</Button>
          </>
        )}
      </DialogFooter>
    </Dialog>
  );
}

// ============================================================
// Wheel sidebar — toggle + variant picker
// ============================================================
function WheelPanel({ data, variant, setVariant }) {
  return (
    <div style={{
      position: "sticky", top: 12,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "14px 14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>The wheel</div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Per-competency current vs. target</div>
        </div>
        <div style={{
          display: "inline-flex", padding: 2, gap: 0,
          background: "var(--surface-strong)", borderRadius: 999,
          border: "1px solid var(--border)",
        }}>
          {[["classic","Radar"],["petals","Petals"],["rings","Rings"]].map(([v,l])=>(
            <button key={v} onClick={()=>setVariant(v)} style={{
              padding: "3px 9px", borderRadius: 999, border: "none",
              background: variant===v ? "var(--background)" : "transparent",
              color: variant===v ? "var(--foreground)" : "var(--muted-foreground)",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              boxShadow: variant===v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}>{l}</button>
          ))}
        </div>
      </div>
      <CareerWheel data={data} variant={variant} />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        fontSize: 11, color: "var(--muted-foreground)", marginTop: 2,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--primary)", opacity: 0.6 }} /> Current
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 0, borderTop: "1.5px dashed var(--muted-foreground)" }} /> Target
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Empty state — first-run sample template seed
// ============================================================
function CareerEmpty({ onSeed, onBlank }) {
  return (
    <div style={{
      maxWidth: 720, margin: "48px auto", padding: 24,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: "var(--accent-tint)", color: "var(--primary)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
      }}>
        <Icon name="target" size={22} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "var(--foreground)" }}>
        Track your career — in the same place you do everything else.
      </div>
      <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--body)", maxWidth: 540, textWrap: "pretty" }}>
        Build a tree of competencies, criteria, and indicators. Score yourself, attach evidence,
        and push a polished snapshot to a Google Sheet when it's time to share.
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18,
      }}>
        <button onClick={onSeed} style={{
          textAlign: "left", padding: 16, borderRadius: "var(--radius-md)",
          background: "var(--surface-soft)", border: "1px solid var(--border)", cursor: "pointer",
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ padding: "2px 7px", borderRadius: 999, background: "var(--primary)",
                            color: "var(--primary-foreground)", fontSize: 10.5, fontWeight: 700 }}>RECOMMENDED</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Start from the Senior Engineer template</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
            5 competencies, 11 criteria, 24 indicators — pre-shaped, no scores.
          </div>
        </button>
        <button onClick={onBlank} style={{
          textAlign: "left", padding: 16, borderRadius: "var(--radius-md)",
          background: "transparent", border: "1px dashed var(--border-strong)", cursor: "pointer",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Start blank</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
            One competency, no criteria. Build it from scratch.
          </div>
        </button>
      </div>
      <div style={{
        marginTop: 18, padding: "10px 12px", borderRadius: "var(--radius-md)",
        background: "var(--surface-strong)", border: "1px solid var(--hairline)",
        fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <Icon name="info" size={12} /> Your data is private to your deployment — same RLS as Projects and Inbox.
      </div>
    </div>
  );
}

// ============================================================
// Archive grid + read-only view
// ============================================================
function ArchiveGrid({ levels, onOpen, onClone }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
      {levels.map(l => (
        <div key={l.id} style={{
          background: "var(--surface-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: 14, position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              padding: "1px 7px", borderRadius: 999,
              background: "var(--surface-strong)", color: "var(--muted-foreground)",
              fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
            }}>Archived</span>
            <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{l.archived_at}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.2 }}>{l.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
            Started {l.created_at}
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 12,
            padding: "8px 0", borderTop: "1px solid var(--hairline-soft)",
            borderBottom: "1px solid var(--hairline-soft)",
          }}>
            {[
              ["Comp.", l.summary.competencies],
              ["Crit.", l.summary.criteria],
              ["Ind.", l.summary.indicators],
              ["Avg",   l.summary.current_avg.toFixed(1)],
            ].map(([k,v])=>(
              <div key={k} style={{ textAlign: "center" }}>
                <div className="t-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{v}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>{k}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <Button variant="outline" size="sm" icon="eye" onClick={()=>onOpen?.(l)} style={{ flex: 1 }}>Open</Button>
            <Button variant="outline" size="sm" icon="copy" onClick={()=>onClone?.(l)} style={{ flex: 1 }}>Clone as template</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Public read-only view (what a manager opening the share link sees)
// ============================================================
function PublicShareView({ level, sat, scoreMode, wheelVariant }) {
  return (
    <div style={{
      maxWidth: 1080, margin: "0 auto", padding: "24px 24px 48px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
        paddingBottom: 12, borderBottom: "1px solid var(--hairline)",
      }}>
        <img src="devy-logo.png" alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
          Shared via Devy · read-only
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          padding: "2px 8px", borderRadius: 999,
          background: "var(--surface-strong)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--muted-foreground)",
        }}>
          <Icon name="lock" size={10} /> Public link
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.6 }}>{level.title}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <HeaderKVs kvs={level.header} readOnly />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" }}>
        <div>
          {level.competencies.map(c => (
            <CompetencyBlock key={c.id} comp={c} scoreMode={scoreMode} readOnly sat={sat.perCriterion} />
          ))}
        </div>
        <WheelPanel
          data={sat.perCompetency}
          variant={wheelVariant}
          setVariant={()=>{}}  /* read-only-ish; viewers can still flip */
        />
      </div>
    </div>
  );
}

// ============================================================
// Main Career page
// ============================================================
function CareerPage({ tweaks }) {
  const { ACTIVE_LEVEL, ARCHIVED_LEVELS, computeSatisfaction } = window.CareerData;
  const [view, setView] = useCar("active"); // active | archive | empty | public
  const [archivedSelected, setArchivedSelected] = useCar(null);
  const [syncOpen, setSyncOpen] = useCar(false);
  const [syncMode, setSyncMode] = useCar("resync");
  const [shareOpen, setShareOpen] = useCar(false);
  const [shareToken, setShareToken] = useCar(ACTIVE_LEVEL.share_token);
  const [splitMode, setSplitMode] = useCar("split"); // split | wheel | tree

  const scoreMode = (tweaks?.scoreMode) || "dots";
  const wheelVariant = (tweaks?.wheelVariant) || "classic";

  const activeLevel = ACTIVE_LEVEL;
  const sat = useCarMemo(() => computeSatisfaction(activeLevel), [activeLevel]);
  const overall = useCarMemo(() => {
    const avg = sat.perCompetency.reduce((s,p)=>s+p.current,0) / Math.max(1, sat.perCompetency.length);
    const tar = sat.perCompetency.reduce((s,p)=>s+p.target,0)  / Math.max(1, sat.perCompetency.length);
    return { avg, target: tar };
  }, [sat]);

  // toggle to public view
  const previewPublic = () => setView("public");

  if (view === "empty") {
    return <CareerEmpty
      onSeed={()=>setView("active")}
      onBlank={()=>setView("active")} />;
  }
  if (view === "public") {
    return (
      <div style={{ minHeight: "100%", background: "var(--background)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 5, padding: "8px 24px",
                      background: "var(--surface-strong)", borderBottom: "1px solid var(--border)",
                      display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <Icon name="eye" size={13} />
          <span>Previewing the public share view</span>
          <span style={{ flex: 1 }} />
          <Button variant="outline" size="sm" icon="x" onClick={()=>setView("active")}>Exit preview</Button>
        </div>
        <PublicShareView level={activeLevel} sat={sat} scoreMode={scoreMode} wheelVariant={wheelVariant} />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 24px 32px", maxWidth: 1320, margin: "0 auto" }}>
      {/* Top header strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LevelSwitcher active={activeLevel} archived={ARCHIVED_LEVELS}
          onPickArchived={(a)=>{ setArchivedSelected(a); setView("archive-detail"); }}
          onNewLevel={()=>setView("empty")} />
        <SyncPill level={{...activeLevel, sheet_id: activeLevel.sheet_id}}
          onOpenSync={()=>{ setSyncMode(activeLevel.sheet_id ? "resync" : "first"); setSyncOpen(true); }} />
        <span style={{ flex: 1 }} />
        <Tabs
          value={view === "archive" ? "archive" : "active"}
          onValueChange={v => { if (v === "archive") setView("archive"); else setView("active"); }}
          items={[{ value: "active", label: "Active" }, { value: "archive", label: `Archive · ${ARCHIVED_LEVELS.length}` }]}
          variant="pill"
        />
        <Button variant="outline" size="md" icon="share-2" onClick={()=>setShareOpen(true)}>Share</Button>
        <ActionsMenu
          onShare={()=>setShareOpen(true)}
          onArchive={()=>{}}
          onClone={()=>{}}
          onUnlink={()=>{}}
        />
      </div>

      {view === "archive" && (
        <div style={{ marginTop: 18 }}>
          <ArchiveGrid levels={ARCHIVED_LEVELS}
            onOpen={(l)=>{ setArchivedSelected(l); setView("archive-detail"); }}
            onClone={()=>{}} />
        </div>
      )}

      {view === "archive-detail" && archivedSelected && (
        <div style={{ marginTop: 18 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
            padding: "10px 14px", borderRadius: "var(--radius-md)",
            background: "var(--surface-strong)", border: "1px solid var(--border)",
          }}>
            <Icon name="archive" size={14} />
            <span style={{ fontSize: 12.5 }}>Read-only snapshot · archived {archivedSelected.archived_at}</span>
            <span style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="copy">Clone as template</Button>
            <Button variant="outline" size="sm" icon="external-link">Open sheet</Button>
            <Button variant="outline" size="sm" icon="x" onClick={()=>setView("archive")}>Close</Button>
          </div>
          {/* For demo, render the active tree as the archived tree (read-only). */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" }}>
            <div>
              {activeLevel.competencies.map(c => (
                <CompetencyBlock key={c.id} comp={c} scoreMode={scoreMode} readOnly sat={sat.perCriterion} />
              ))}
            </div>
            <WheelPanel data={sat.perCompetency} variant={wheelVariant} setVariant={()=>{}} />
          </div>
        </div>
      )}

      {view === "active" && (
        <>
          {/* Hero strip with overall avg + header KVs */}
          <div style={{
            marginTop: 14, padding: 16,
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 16,
            background: "var(--surface-card)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
          }}>
            <div style={{
              display: "flex", flexDirection: "column", justifyContent: "center",
              padding: "0 18px 0 4px", borderRight: "1px solid var(--hairline)", minWidth: 160,
            }}>
              <div className="t-tag">Current overall</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1, color: "var(--foreground)" }}>
                  {overall.avg.toFixed(1)}
                </span>
                <span style={{ fontSize: 14, color: "var(--muted-foreground)", fontWeight: 500 }}>
                  / {overall.target.toFixed(1)} target
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                {sat.perCompetency.filter(c => c.current >= c.target).length} of {sat.perCompetency.length} at target
              </div>
            </div>
            <HeaderKVs kvs={activeLevel.header} />
          </div>

          {/* Search + view toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <Input icon="search" placeholder="Filter indicators…" style={{ width: 280 }} />
            <span style={{ flex: 1 }} />
            <span className="t-tag" style={{ marginRight: 4 }}>Score input</span>
            <div style={{
              display: "inline-flex", padding: 2, gap: 0,
              background: "var(--surface-strong)", borderRadius: 999, border: "1px solid var(--border)",
            }}>
              {[["dots","Dots"],["chips","Chips"]].map(([v,l])=>(
                <button key={v} onClick={()=>{
                  // post live tweak update
                  window.parent.postMessage({type:"__edit_mode_set_keys", edits:{ scoreMode: v }}, "*");
                  // also flip locally so it works without the host
                  if (window.__careerSetTweak) window.__careerSetTweak({ scoreMode: v });
                }} style={{
                  padding: "3px 11px", borderRadius: 999, border: "none",
                  background: scoreMode===v ? "var(--background)" : "transparent",
                  color: scoreMode===v ? "var(--foreground)" : "var(--muted-foreground)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  boxShadow: scoreMode===v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}>{l}</button>
              ))}
            </div>
            <div style={{
              display: "inline-flex", padding: 2, gap: 0, marginLeft: 8,
              background: "var(--surface-strong)", borderRadius: 999, border: "1px solid var(--border)",
            }}>
              {[["split","Split","columns-2"],["tree","Tree","list-tree"],["wheel","Wheel","pie-chart"]].map(([v,l,ic])=>(
                <button key={v} onClick={()=>setSplitMode(v)} style={{
                  padding: "3px 9px", borderRadius: 999, border: "none",
                  background: splitMode===v ? "var(--background)" : "transparent",
                  color: splitMode===v ? "var(--foreground)" : "var(--muted-foreground)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                  boxShadow: splitMode===v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}>
                  <Icon name={ic} size={11} /> {l}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{
            marginTop: 14, display: "grid",
            gridTemplateColumns: splitMode === "split" ? "1.6fr 1fr" : "1fr",
            gap: 18, alignItems: "start",
          }}>
            {splitMode !== "wheel" && (
              <div>
                {activeLevel.competencies.map(c => (
                  <CompetencyBlock key={c.id} comp={c} scoreMode={scoreMode} sat={sat.perCriterion} />
                ))}
                <button style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 14px",
                  background: "transparent", border: "1px dashed var(--border-strong)",
                  borderRadius: "var(--radius-lg)", color: "var(--muted-foreground)",
                  fontSize: 13, cursor: "pointer", justifyContent: "center",
                }}>
                  <Icon name="plus" size={13} /> Add competency
                </button>
              </div>
            )}
            {splitMode !== "tree" && (
              <div style={splitMode === "wheel" ? { maxWidth: 560, margin: "0 auto", width: "100%" } : null}>
                <WheelPanel
                  data={sat.perCompetency}
                  variant={wheelVariant}
                  setVariant={(v)=>{
                    window.parent.postMessage({type:"__edit_mode_set_keys", edits:{ wheelVariant: v }}, "*");
                    if (window.__careerSetTweak) window.__careerSetTweak({ wheelVariant: v });
                  }}
                />

                {/* Public-view preview link */}
                <button onClick={previewPublic} style={{
                  marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)",
                  background: "var(--surface-soft)", border: "1px solid var(--border)",
                  cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <Icon name="eye" size={14} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}>Preview the public view</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>What a manager opening your share link sees</div>
                  </div>
                  <Icon name="chevron-right" size={13} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} level={activeLevel} mode={syncMode} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen}
        level={{ ...activeLevel, share_token: shareToken }}
        onGenerate={() => setShareToken(activeLevel.share_token || "kxq2-8m9p-r4v0")}
        onRevoke={() => setShareToken(null)}
      />
    </div>
  );
}

window.CareerPage = CareerPage;
