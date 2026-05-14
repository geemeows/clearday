// Devy — Career page (active level: tree + wheel, header, sync, share, archive)
// All sub-components inline to keep the surface in one file.

const { useState: useCar, useMemo: useCarMemo, useEffect: useCarEffect, useRef: useCarRef } = React;

// ============================================================
// Score input — dots only (0..max filled circles + N/max readout)
// ============================================================
// ============================================================
// Score input — 1..4 filled circles (no zero) + value readout
// ============================================================
function ScoreDots({ value, max = 4, onChange, readOnly, target }) {
  const v = Math.max(1, Math.min(max, value || 1));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    role="radiogroup" aria-label="Score">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1; // 1..max
        const filled = n <= v;
        const isTarget = typeof target === "number" && n === target;
        return (
          <button key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-checked={v === n} role="radio"
          title={window.CareerData.CAREER_LEGEND[n]}
          style={{
            width: 11, height: 11, borderRadius: "50%",
            border: filled ? "1px solid var(--primary)" : "1px solid var(--border-strong)",
            background: filled ? "var(--primary)" : "transparent",
            padding: 0, cursor: readOnly ? "default" : "pointer",
            transition: "all 80ms",
            boxShadow: isTarget ? "0 0 0 2px var(--background), 0 0 0 3px var(--foreground)" : "none",
          }} />);
      })}
      <span className="t-mono" style={{ marginLeft: 6, color: "var(--muted-foreground)", minWidth: 26 }}>
        {v}/{max}
      </span>
    </div>);
}

// ============================================================
// Evidence chip
// ============================================================
function EvidenceChip({ ev, readOnly, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 4px 2px 6px", borderRadius: 999,
      background: ev.kind === "text" ? "var(--surface-soft)" : "var(--surface-strong)", border: "1px solid var(--hairline)",
      color: "var(--foreground)", fontSize: 11.5, fontWeight: 500,
      textDecoration: "none", maxWidth: 280
    }} title={ev.title}>
      {ev.kind === "jira" ? <SourceGlyph source="jira" size={12} /> :
      ev.kind === "text" ? <Icon name="quote" size={11} /> :
      ev.card_id ? <Icon name="layout-grid" size={11} /> :
      <Icon name="link-2" size={11} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontStyle: ev.kind === "text" ? "italic" : "normal" }}>
        {ev.kind === "text" ? `“${ev.title}”` : ev.title}
      </span>
      {!readOnly && onRemove &&
      <button onClick={(e) => {e.stopPropagation();onRemove();}} style={{
        width: 14, height: 14, border: "none", background: "transparent",
        color: "var(--muted-foreground)", cursor: "pointer", padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 999
      }} aria-label="Remove evidence">
          <Icon name="x" size={10} />
        </button>
      }
    </span>);

}

// Evidence row — single collapsible badge that expands the chip list inline.
function EvidenceList({ items, readOnly, onRemove, onShowAll }) {
  const [open, setOpen] = useCar(false);
  if (items.length === 0) return null;
  const labelKind = (n) => `${n} evidence`;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 9px 2px 7px", borderRadius: 999,
        background: "var(--surface-card)", border: "1px solid var(--border)",
        color: "var(--foreground)", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }} title="Show evidence">
        <Icon name="paperclip" size={11} />
        {labelKind(items.length)}
        <Icon name="chevron-right" size={11} style={{ color: "var(--muted-foreground)" }} />
      </button>
    );
  }
  return (
    <>
      <button onClick={() => setOpen(false)} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 9px 2px 7px", borderRadius: 999,
        background: "var(--accent-tint)", border: "1px solid var(--primary)",
        color: "var(--primary)", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      }} title="Collapse evidence">
        <Icon name="paperclip" size={11} />
        {labelKind(items.length)}
        <Icon name="chevron-down" size={11} />
      </button>
      {items.map((ev) =>
        <EvidenceChip key={ev.id} ev={ev} readOnly={readOnly}
          onRemove={() => onRemove?.(ev.id)} />
      )}
      {onShowAll && items.length > 4 && (
        <button onClick={onShowAll} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 9px", borderRadius: 999,
          background: "transparent", border: "1px solid var(--border)",
          color: "var(--muted-foreground)", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
        }}>
          Manage all
        </button>
      )}
    </>
  );
}

// ============================================================
// Indicator row
// ============================================================
function IndicatorRow({ ind, readOnly, onScoreChange, onAddEvidence, onRemoveEvidence, onShowAllEvidence, onShowComments }) {
  const comments = ind.comments || [];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14,
      padding: "10px 14px 10px 8px",
      borderTop: "1px solid var(--hairline-soft)",
      alignItems: "start"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 2 }}>
        {!readOnly &&
        <button title="Drag to reorder" style={{
          width: 16, height: 16, padding: 0, border: "none", background: "transparent",
          color: "var(--muted-soft)", cursor: "grab", opacity: 0.7
        }}>
            <Icon name="grip-vertical" size={14} />
          </button>
        }
        <span className="t-mono" style={{
          padding: "1px 6px", borderRadius: 4,
          background: "var(--surface-strong)", color: "var(--muted-foreground)",
          fontSize: 11, fontWeight: 600, letterSpacing: 0.3
        }}>{ind.code}</span>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--foreground)", lineHeight: 1.45, textWrap: "pretty" }}>
          {ind.description}
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <EvidenceList items={ind.evidence} readOnly={readOnly}
          onRemove={(evId) => onRemoveEvidence?.(ind.id, evId)}
          onShowAll={() => onShowAllEvidence?.(ind)} />
          {!readOnly &&
          <button onClick={() => onAddEvidence?.(ind)} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px 2px 6px", borderRadius: 999,
            background: "transparent", border: "1px dashed var(--border-strong)",
            color: "var(--muted-foreground)", fontSize: 11.5, cursor: "pointer"
          }}>
              <Icon name="plus" size={11} /> Evidence
            </button>
          }
          {!readOnly &&
          <button onClick={() => onShowComments?.(ind)} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px 2px 6px", borderRadius: 999,
            background: "transparent", border: "1px solid transparent",
            color: "var(--muted-foreground)", fontSize: 11.5, cursor: "pointer"
          }} onMouseEnter={(e) => {e.currentTarget.style.borderColor = "var(--border)";}}
          onMouseLeave={(e) => {e.currentTarget.style.borderColor = "transparent";}}>
              <Icon name="message-circle" size={11} />
              {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comment"}
            </button>
          }
          {ind.notes &&
          <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", fontStyle: "italic", marginLeft: 2 }}>
              — {ind.notes}
            </span>
          }
        </div>
      </div>

      <div style={{ paddingTop: 1 }}>
        <ScoreDots value={ind.score} target={ind.target}
          onChange={(v) => onScoreChange?.(ind.id, v)} readOnly={readOnly} />
      </div>
    </div>);

}

// ============================================================
// Criterion section
// ============================================================
function CriterionSection({ cr, letter, readOnly, sat, onAddEvidence, onRemoveEvidence, onScoreChange, onAddIndicator, onShowAllEvidence, onShowComments }) {
  const summary = sat && sat[cr.id];
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10,
        padding: "6px 8px", borderBottom: "1px solid var(--hairline-soft)"
      }}>
        <span style={{
          width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-strong)", borderRadius: 4,
          fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)"
        }}>{letter}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>{cr.name}</span>
        {summary &&
        <span className="t-mono" style={{
          fontSize: 10.5, fontWeight: 600, color: "var(--muted-foreground)",
          padding: "1px 6px", borderRadius: 4, background: "var(--surface-strong)",
          border: "1px solid var(--hairline)"
        }}>
            {summary.avg.toFixed(1)} <span style={{ color: "var(--muted-soft)" }}>/ {summary.target.toFixed(1)} target</span>
          </span>
        }
        <span style={{ flex: 1 }} />
        {!readOnly &&
        <button onClick={() => onAddIndicator?.(cr)} style={{
          border: "none", background: "transparent", color: "var(--muted-foreground)",
          fontSize: 11.5, cursor: "pointer", padding: "3px 7px", borderRadius: 4,
          display: "inline-flex", alignItems: "center", gap: 4
        }} onMouseEnter={(e) => {e.currentTarget.style.background = "var(--accent)";e.currentTarget.style.color = "var(--foreground)";}}
        onMouseLeave={(e) => {e.currentTarget.style.background = "transparent";e.currentTarget.style.color = "var(--muted-foreground)";}}>
            <Icon name="plus" size={11} /> Indicator
          </button>
        }
      </div>
      <div>
        {cr.indicators.map((ind) =>
        <IndicatorRow key={ind.id} ind={ind} readOnly={readOnly}
        onScoreChange={onScoreChange}
        onAddEvidence={onAddEvidence}
        onRemoveEvidence={onRemoveEvidence}
        onShowAllEvidence={onShowAllEvidence}
        onShowComments={onShowComments} />
        )}
        {!readOnly && cr.indicators.length === 0 &&
        <button onClick={() => onAddIndicator?.(cr)} style={{
          width: "100%", padding: "10px 14px", marginTop: 4,
          background: "transparent", border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-sm)", color: "var(--muted-foreground)",
          fontSize: 12, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
        }}>
            <Icon name="plus" size={12} /> Add the first indicator
          </button>
        }
      </div>
    </div>);

}

// ============================================================
// Competency block
// ============================================================
function CompetencyBlock({ comp, readOnly, sat, onAddEvidence, onRemoveEvidence, onScoreChange, onAddCriterion, onAddIndicator, onShowAllEvidence, onShowComments }) {
  return (
    <section style={{
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", marginBottom: 14, overflow: "hidden"
    }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid var(--hairline)",
        background: "linear-gradient(180deg, var(--surface-soft) 0%, var(--surface-card) 100%)"
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          background: "var(--primary)", color: "var(--primary-foreground)",
          fontSize: 13, fontWeight: 700
        }}>{comp.name[0]}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)" }}>{comp.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>
            {comp.criteria.length} criteria · {comp.criteria.reduce((s, c) => s + c.indicators.length, 0)} indicators
          </div>
        </div>
        {!readOnly &&
        <button onClick={() => onAddCriterion?.(comp)} style={{
          border: "1px solid var(--border)", background: "var(--background)",
          color: "var(--foreground)", fontSize: 12, cursor: "pointer", padding: "5px 10px",
          borderRadius: "var(--radius-sm)", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500
        }} onMouseEnter={(e) => {e.currentTarget.style.borderColor = "var(--primary)";e.currentTarget.style.color = "var(--primary)";}}
        onMouseLeave={(e) => {e.currentTarget.style.borderColor = "var(--border)";e.currentTarget.style.color = "var(--foreground)";}}>
            <Icon name="plus" size={12} /> Criterion
          </button>
        }
      </header>
      <div style={{ padding: "0 4px 14px" }}>
        {comp.criteria.map((cr, i) =>
        <CriterionSection
          key={cr.id} cr={cr}
          letter={String.fromCharCode(65 + i)}
          readOnly={readOnly} sat={sat}
          onAddEvidence={onAddEvidence}
          onRemoveEvidence={onRemoveEvidence}
          onScoreChange={onScoreChange}
          onAddIndicator={onAddIndicator}
          onShowAllEvidence={onShowAllEvidence}
          onShowComments={onShowComments} />
        )}
        {!readOnly && comp.criteria.length === 0 &&
        <button onClick={() => onAddCriterion?.(comp)} style={{
          width: "calc(100% - 8px)", margin: "14px 4px 0", padding: "12px 14px",
          background: "transparent", border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-md)", color: "var(--muted-foreground)",
          fontSize: 12.5, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
        }}>
            <Icon name="plus" size={12} /> Add the first criterion
          </button>
        }
      </div>
    </section>);

}

// ============================================================
// Header KV strip
// ============================================================
function HeaderKVs({ kvs, readOnly, onAddField }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 1, background: "var(--border)",
      border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden"
    }}>
      {kvs.map((kv, i) =>
      <div key={i} style={{ background: "var(--surface-card)", padding: "10px 14px" }}>
          <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 3 }}>{kv.key}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{kv.value}</div>
        </div>
      )}
      {!readOnly &&
      <button onClick={onAddField} style={{
        background: "var(--surface-card)", padding: "10px 14px", border: "none",
        textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
        gap: 6, color: "var(--muted-foreground)", fontSize: 12
      }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-soft)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "var(--surface-card)"}>
          <Icon name="plus" size={12} /> Add field
        </button>
      }
    </div>);

}

// ============================================================
// Level switcher (dropdown in header) — now the single archive entry-point
// ============================================================
function LevelSwitcher({ active, archived, onPickArchived, onViewArchive, onNewLevel }) {
  const [open, setOpen] = useCar(false);
  const ref = useCarRef(null);
  useCarEffect(() => {
    const onDoc = (e) => {if (ref.current && !ref.current.contains(e.target)) setOpen(false);};
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px 5px 12px", borderRadius: "var(--radius-md)",
        background: "var(--surface-card)", border: "1px solid var(--border)",
        color: "var(--foreground)", cursor: "pointer"
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.4 }}>{active.title.split("·")[0].trim()}</span>
        <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500 }}>
          {active.title.split("·").slice(1).join("·").trim()}
        </span>
        <span style={{
          marginLeft: 6, padding: "1px 7px", borderRadius: 999,
          background: "var(--good-soft)", color: "var(--good)",
          fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase"
        }}>Active</span>
        <Icon name="chevron-down" size={13} />
      </button>
      {open &&
      <div style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 30,
        width: 340, background: "var(--popover)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4
      }}>
          <div className="t-tag" style={{ padding: "8px 10px 4px" }}>Active</div>
          <div style={{ padding: "8px 10px", borderRadius: 6, background: "var(--accent-tint)" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{active.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>Started {active.created_at}</div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", padding: "12px 10px 4px" }}>
            <span className="t-tag">Archive</span>
            <span className="t-mono" style={{ marginLeft: 6, fontSize: 10, color: "var(--muted-foreground)" }}>
              {archived.length} archived
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => {setOpen(false);onViewArchive?.();}} style={{
            border: "none", background: "transparent", cursor: "pointer",
            color: "var(--primary)", fontSize: 11, fontWeight: 600, padding: 0
          }}>View all →</button>
          </div>
          {archived.map((a) =>
        <button key={a.id} onClick={() => {setOpen(false);onPickArchived?.(a);}} style={{
          display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
          padding: "8px 10px", borderRadius: 6, cursor: "pointer"
        }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                Archived {a.archived_at} · avg {a.summary.current_avg}
              </div>
            </button>
        )}
          <div style={{ borderTop: "1px solid var(--hairline)", marginTop: 4, paddingTop: 4 }}>
            <button onClick={() => {setOpen(false);onNewLevel?.();}} style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
            borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
            color: "var(--primary)", fontSize: 13, fontWeight: 500
          }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <Icon name="plus" size={13} /> New blank level…
            </button>
          </div>
        </div>
      }
    </div>);

}

// ============================================================
// Sync pill
// ============================================================
function SyncPill({ level, onOpenSync }) {
  const linked = !!level.sheet_id;
  return (
    <button onClick={onOpenSync} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 10px 5px 8px", borderRadius: 999,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      cursor: "pointer", color: "var(--foreground)"
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        background: "#0F9D58", color: "white", fontSize: 11, fontWeight: 700
      }}>S</span>
      {linked ?
      <>
          <span style={{ fontSize: 12.5 }}>Synced <span style={{ color: "var(--muted-foreground)" }}>{level.last_synced_at}</span></span>
          <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          color: "var(--primary)", fontWeight: 600, fontSize: 12.5,
          paddingLeft: 6, borderLeft: "1px solid var(--hairline)"
        }}>
            <Icon name="refresh-cw" size={11} /> Sync now
          </span>
        </> :

      <span style={{ fontSize: 12.5, color: "var(--primary)", fontWeight: 600 }}>
          Sync to Google Sheet
        </span>
      }
    </button>);

}

// ============================================================
// Actions menu
// ============================================================
function ActionsMenu({ onShare, onArchive, onClone, onUnlink }) {
  const [open, setOpen] = useCar(false);
  const ref = useCarRef(null);
  useCarEffect(() => {
    const onDoc = (e) => {if (ref.current && !ref.current.contains(e.target)) setOpen(false);};
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const item = (icon, label, action, danger) =>
  <button onClick={() => {setOpen(false);action?.();}} style={{
    display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px",
    borderRadius: 6, border: "none", background: "transparent", cursor: "pointer",
    color: danger ? "var(--danger)" : "var(--foreground)", fontSize: 13, textAlign: "left"
  }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent)"}
  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <Icon name={icon} size={13} /> {label}
    </button>;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconButton icon="more-horizontal" label="Level actions" onClick={() => setOpen((o) => !o)} />
      {open &&
      <div style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30,
        minWidth: 220, background: "var(--popover)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: 4
      }}>
          {item("share-2", "Generate share link", onShare)}
          {item("copy", "Clone as starting template", onClone)}
          {item("archive", "Archive this level", onArchive)}
          {item("unlink", "Unlink Google Sheet", onUnlink, true)}
        </div>
      }
    </div>);

}

// ============================================================
// Sync dialog
// ============================================================
function SyncDialog({ open, onOpenChange, level, mode = "resync" }) {
  const [phase, setPhase] = useCar("idle");
  useCarEffect(() => {if (open) setPhase(mode === "error" ? "error" : "idle");}, [open, mode]);
  const run = () => {setPhase("running");setTimeout(() => setPhase("done"), 1100);};
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--good-soft)",
          display: "inline-flex", alignItems: "center", justifyContent: "center"
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 4, background: "#0F9D58",
            color: "white", fontWeight: 700, fontSize: 14,
            display: "inline-flex", alignItems: "center", justifyContent: "center"
          }}>S</span>
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>
            {mode === "first" ? "Push to a new Google Sheet" :
            mode === "error" ? "Sync didn't finish" :
            "Sync to Google Sheet"}
          </DialogTitle>
          <DialogDescription>
            {mode === "first" ?
            "We'll create a new sheet in your Drive and write a Report tab + a Wheel chart. The link will be saved to this level." :
            "We'll clear and rewrite the Report and Wheel tabs of the linked sheet. Other tabs stay untouched."}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        {phase === "error" &&
        <div style={{
          display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--radius-md)",
          background: "var(--danger-soft)", border: "1px solid var(--danger)",
          color: "var(--danger)", fontSize: 12.5
        }}>
            <Icon name="alert-circle" size={16} />
            <div>
              <div style={{ fontWeight: 600 }}>Network failure mid-sync</div>
              <div>The linked sheet wasn't modified. Retry when you're back online.</div>
            </div>
          </div>
        }

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div style={{
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
            padding: "10px 12px", background: "var(--surface-soft)"
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
            padding: "10px 12px", background: "var(--surface-soft)"
          }}>
            <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 4 }}>Linked sheet</div>
            {mode === "first" ?
            <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                None yet — we'll create one in your Drive.
              </div> :

            <a href={level.sheet_url} style={{
              fontSize: 12.5, color: "var(--primary)", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%"
            }}>
                <Icon name="external-link" size={11} /> {level.title} · sheet
              </a>
            }
          </div>
        </div>

        <div style={{
          marginTop: 10, padding: "9px 12px", borderRadius: "var(--radius-md)",
          background: "var(--surface-strong)", border: "1px solid var(--hairline)",
          fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8
        }}>
          <Icon name="lock" size={12} /> One-way: Sheet → Devy edits don't flow back.
        </div>
      </DialogBody>
      <DialogFooter>
        {phase === "done" ?
        <>
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--good)", fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="check-circle-2" size={14} /> Synced. Sheet is up to date.
            </span>
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="primary" size="md" icon="external-link" onClick={() => onOpenChange(false)}>Open sheet</Button>
          </> :

        <>
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)} disabled={phase === "running"}>Cancel</Button>
            <Button variant="primary" size="md"
          icon={phase === "running" ? "loader-2" : mode === "first" ? "send" : "refresh-cw"}
          onClick={run} disabled={phase === "running"}>
              {phase === "running" ? "Writing…" : mode === "first" ? "Create & sync" : mode === "error" ? "Retry sync" : "Sync now"}
            </Button>
          </>
        }
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Share link dialog
// ============================================================
function ShareDialog({ open, onOpenChange, level, onRevoke, onGenerate }) {
  const [copied, setCopied] = useCar(false);
  const url = level.share_token ? `https://devy.app/career/share/${level.share_token}` : null;
  const copy = () => {
    navigator.clipboard?.writeText(url || "").catch(() => {});
    setCopied(true);setTimeout(() => setCopied(false), 1400);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
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
        {url ?
        <>
            <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: "var(--radius-md)",
            background: "var(--surface-strong)", border: "1px solid var(--border)"
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
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
          </> :

        <div style={{
          padding: "16px", borderRadius: "var(--radius-md)",
          background: "var(--surface-soft)", border: "1px dashed var(--border)",
          textAlign: "center", color: "var(--muted-foreground)", fontSize: 12.5
        }}>
            No link yet. Generate one to share this level.
          </div>
        }
      </DialogBody>
      <DialogFooter>
        {url ?
        <>
            <Button variant="outline" size="md" icon="x-circle" onClick={onRevoke}>Revoke link</Button>
            <span style={{ flex: 1 }} />
            <Button variant="outline" size="md" icon="eye" onClick={() => window.open(url, "_blank")}>Preview</Button>
            <Button variant="primary" size="md" onClick={() => onOpenChange(false)}>Done</Button>
          </> :

        <>
            <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" size="md" icon="share-2" onClick={onGenerate}>Generate share link</Button>
          </>
        }
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Add Evidence modal
// ============================================================
function EvidenceAddDialog({ open, onOpenChange, indicator, onSave }) {
  const [kind, setKind] = useCar("link"); // link | text | project | jira
  const [title, setTitle] = useCar("");
  const [url, setUrl] = useCar("");
  const [pickedCardId, setPickedCardId] = useCar("");
  const [text, setText] = useCar("");
  const [jiraKey, setJiraKey] = useCar("");
  const [jiraTitle, setJiraTitle] = useCar("");

  useCarEffect(() => {
    if (open) {setKind("link");setTitle("");setUrl("");setPickedCardId("");setText("");setJiraKey("");setJiraTitle("");}
  }, [open]);

  const projectCards = useCarMemo(() => {
    const projects = window.ProjectsData || [];
    return projects.flatMap((p) => (p.cards || []).map((c) => ({
      id: c.id, title: c.title, project: p.name, projectColor: p.color,
      linkedId: c.linked && c.linked.id
    })));
  }, [open]);

  const canSave =
  kind === "link" ? title.trim() && url.trim() :
  kind === "text" ? !!text.trim() :
  kind === "project" ? !!pickedCardId :
  kind === "jira" ? jiraKey.trim() && jiraTitle.trim() :
  false;

  const save = () => {
    if (!canSave) return;
    let ev;
    if (kind === "link") ev = { kind: "link", title: title.trim(), url: url.trim() };else
    if (kind === "text") ev = { kind: "text", title: text.trim(), url: null };else
    if (kind === "project") {
      const c = projectCards.find((x) => x.id === pickedCardId);
      ev = { kind: "project", title: c?.title || "Linked card", url: "#", card_id: c?.id };
    } else if (kind === "jira") {
      ev = { kind: "jira", title: `${jiraKey.trim().toUpperCase()} · ${jiraTitle.trim()}`, url: `#${jiraKey.trim()}` };
    }
    onSave?.(ev);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="link-2" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Attach evidence</DialogTitle>
          <DialogDescription>
            {indicator ? <>For <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--foreground)" }}>{indicator.code}</span> — {indicator.description.slice(0, 80)}{indicator.description.length > 80 ? "…" : ""}</> : "Add a link or a Devy project card as proof."}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        {/* kind switch */}
        <div style={{
          display: "inline-flex", padding: 2, gap: 0,
          background: "var(--surface-strong)", borderRadius: 999,
          border: "1px solid var(--border)", marginBottom: 14
        }}>
          {[["link", "External link", "link-2"], ["text", "Free-form note", "quote"], ["project", "Project card", "layout-grid"], ["jira", "Jira card", "jira"]].map(([k, l, ic]) =>
          <button key={k} onClick={() => setKind(k)} style={{
            padding: "5px 12px", borderRadius: 999, border: "none",
            background: kind === k ? "var(--background)" : "transparent",
            color: kind === k ? "var(--foreground)" : "var(--muted-foreground)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
            boxShadow: kind === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none"
          }}>
              {k === "jira" ? <SourceGlyph source="jira" size={12} /> : <Icon name={ic} size={12} />} {l}
            </button>
          )}
        </div>

        {kind === "link" &&
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. PR #421 · order-cache TTL" autoFocus />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>URL</span>
              <Input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/…" icon="link-2" />
            </label>
            <div style={{
            padding: "8px 10px", borderRadius: "var(--radius-sm)",
            background: "var(--surface-soft)", border: "1px solid var(--hairline)",
            fontSize: 11.5, color: "var(--muted-foreground)"
          }}>
              GitHub PRs, RFC docs, postmortems, and dashboards are all common evidence.
            </div>
          </div>
        }

        {kind === "text" &&
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="t-tag" style={{ fontSize: 9.5 }}>What happened?</span>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Caught a race condition in @aliya's review of the briefing cache and proposed the fix that landed."
          rows={4}
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5,
            fontFamily: "inherit", color: "var(--foreground)",
            background: "var(--background)", border: "1px solid var(--input)",
            borderRadius: "var(--radius-md)", outline: "none", resize: "vertical"
          }} />
          <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
            Sentences and short notes are fine — not everything has a link.
          </span>
        </label>
        }

        {kind === "project" &&
        <div>
            <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 6 }}>Pick a project card</div>
            <div style={{
            maxHeight: 260, overflowY: "auto",
            border: "1px solid var(--border)", borderRadius: "var(--radius-md)"
          }}>
              {projectCards.length === 0 ?
            <div style={{ padding: 16, textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>
                  No project cards yet. Create some in Projects, then attach them as evidence here.
                </div> :
            projectCards.map((c, i) => {
              const active = pickedCardId === c.id;
              return (
                <button key={c.id} onClick={() => setPickedCardId(c.id)} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center",
                  width: "100%", padding: "9px 12px", textAlign: "left", border: "none",
                  background: active ? "var(--accent-tint)" : "transparent", cursor: "pointer",
                  borderTop: i ? "1px solid var(--hairline-soft)" : "none"
                }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: c.projectColor || "var(--muted-foreground)" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                        {c.project}{c.linkedId ? ` · ${c.linkedId}` : ""}
                      </div>
                    </div>
                    {active && <Icon name="check" size={13} />}
                  </button>);

            })}
            </div>
          </div>
        }

        {kind === "jira" &&
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>Key</span>
              <Input value={jiraKey} onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
              placeholder="ACME-1234" autoFocus
              style={{ fontFamily: "var(--font-mono)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>Summary</span>
              <Input value={jiraTitle} onChange={(e) => setJiraTitle(e.target.value)}
              placeholder="Idempotent retry tick for cron orchestrator" />
            </label>
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: "var(--radius-md)",
            background: "var(--surface-soft)", border: "1px solid var(--hairline)",
            display: "flex", alignItems: "center", gap: 10, fontSize: 12,
            color: "var(--muted-foreground)"
          }}>
            <SourceGlyph source="jira" size={16} />
            <span>Devy will resolve the title from your linked Jira workspace on save.</span>
          </div>
        </div>
        }
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="plus" onClick={save} disabled={!canSave}>Attach evidence</Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Add Header Field modal
// ============================================================
function HeaderFieldDialog({ open, onOpenChange, onSave }) {
  const [items, setItems] = useCar([{ key: "", value: "" }]);
  useCarEffect(() => {if (open) setItems([{ key: "", value: "" }]);}, [open]);

  const SUGGESTIONS = ["Team", "Tenure", "Location", "Manager backup", "Promo window", "Salary band"];

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const addRow = () => setItems((arr) => [...arr, { key: "", value: "" }]);
  const removeRow = (i) => setItems((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr);

  const valid = items.some((it) => it.key.trim() && it.value.trim());

  const save = () => {
    const clean = items.filter((it) => it.key.trim() && it.value.trim()).
    map((it) => ({ key: it.key.trim(), value: it.value.trim() }));
    if (clean.length) onSave?.(clean);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="list-plus" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Add header fields</DialogTitle>
          <DialogDescription>
            Free-form key/value pairs surfaced at the top of every shared snapshot.
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) =>
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 8, alignItems: "center"
          }}>
              <Input value={it.key} onChange={(e) => setItem(i, { key: e.target.value })}
            placeholder="Key (e.g. Team)" autoFocus={i === 0} />
              <Input value={it.value} onChange={(e) => setItem(i, { value: e.target.value })}
            placeholder="Value (e.g. Platform)" />
              <IconButton icon="x" label="Remove" size="sm"
            onClick={() => removeRow(i)} />
            </div>
          )}
          <button onClick={addRow} style={{
            alignSelf: "flex-start", marginTop: 2,
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            background: "transparent", border: "1px dashed var(--border-strong)",
            color: "var(--muted-foreground)", fontSize: 12, cursor: "pointer"
          }}>
            <Icon name="plus" size={12} /> Add another field
          </button>
        </div>
        <div style={{
          marginTop: 14, padding: "10px 12px", borderRadius: "var(--radius-md)",
          background: "var(--surface-soft)", border: "1px solid var(--hairline)"
        }}>
          <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 6 }}>Suggestions</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTIONS.map((s) => {
              const used = items.some((it) => it.key.trim().toLowerCase() === s.toLowerCase());
              return (
                <button key={s} disabled={used} onClick={() => {
                  const i = items.findIndex((it) => !it.key.trim());
                  if (i >= 0) setItem(i, { key: s });else
                  setItems((arr) => [...arr, { key: s, value: "" }]);
                }} style={{
                  padding: "3px 9px", borderRadius: 999,
                  background: "var(--surface-card)", border: "1px solid var(--border)",
                  color: used ? "var(--muted-soft)" : "var(--foreground)",
                  fontSize: 11.5, cursor: used ? "default" : "pointer",
                  opacity: used ? 0.5 : 1
                }}>{s}</button>);

            })}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="check" onClick={save} disabled={!valid}>
          Save fields
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Add Competency modal
// ============================================================
function CompetencyAddDialog({ open, onOpenChange, onSave }) {
  const [name, setName] = useCar("");
  const PRESETS = [
  "Mentorship", "Cross-team collaboration", "Operational excellence",
  "Domain expertise", "Hiring & interviewing", "Product sense"];

  useCarEffect(() => {if (open) setName("");}, [open]);
  const save = () => {if (name.trim()) {onSave?.(name.trim());onOpenChange(false);}};
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="layers" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Add a competency</DialogTitle>
          <DialogDescription>
            A grouping for related criteria. You'll add criteria + indicators next.
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span className="t-tag" style={{ fontSize: 9.5 }}>Competency name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mentorship" autoFocus
          onKeyDown={(e) => {if (e.key === "Enter") save();}} />
        </label>
        <div style={{ marginTop: 14 }}>
          <div className="t-tag" style={{ fontSize: 9.5, marginBottom: 6 }}>Common picks</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PRESETS.map((p) =>
            <button key={p} onClick={() => setName(p)} style={{
              padding: "4px 10px", borderRadius: 999,
              background: name === p ? "var(--accent-tint)" : "var(--surface-card)",
              border: name === p ? "1px solid var(--primary)" : "1px solid var(--border)",
              color: name === p ? "var(--primary)" : "var(--foreground)",
              fontSize: 12, cursor: "pointer", fontWeight: 500
            }}>{p}</button>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="plus" onClick={save} disabled={!name.trim()}>
          Add competency
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Add Criterion modal
// ============================================================
function CriterionAddDialog({ open, onOpenChange, parentComp, onSave }) {
  const [name, setName] = useCar("");
  useCarEffect(() => {if (open) setName("");}, [open]);
  const save = () => {if (name.trim()) {onSave?.(parentComp.id, { name: name.trim() });onOpenChange(false);}};
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="list-checks" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Add a criterion</DialogTitle>
          <DialogDescription>
            {parentComp ? <>Under <b style={{ color: "var(--foreground)" }}>{parentComp.name}</b>. Criteria are measurable focus areas; indicators sit beneath.</> : null}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 6 }}>
          <span className="t-tag" style={{ fontSize: 9.5 }}>Criterion name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Code review, Estimation, Mentoring…" autoFocus
          onKeyDown={(e) => {if (e.key === "Enter") save();}} />
        </label>
        <div style={{
          padding: "8px 10px", borderRadius: "var(--radius-sm)",
          background: "var(--surface-soft)", border: "1px solid var(--hairline)",
          fontSize: 11.5, color: "var(--muted-foreground)",
        }}>
          Targets are set per <b style={{ color: "var(--foreground)" }}>indicator</b> once you add them — each behavior can demand a different level.
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="plus" onClick={save} disabled={!name.trim()}>
          Add criterion
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Add Indicator modal
// ============================================================
function IndicatorAddDialog({ open, onOpenChange, parentCrit, suggestCode, onSave }) {
  const [code, setCode] = useCar("");
  const [description, setDescription] = useCar("");
  const [notes, setNotes] = useCar("");
  const [score, setScore] = useCar(1);
  const [target, setTarget] = useCar(3);
  useCarEffect(() => {
    if (open) {
      setCode(suggestCode || "");
      setDescription("");setNotes("");setScore(1);setTarget(3);
    }
  }, [open, suggestCode]);
  const save = () => {
    if (!description.trim()) return;
    onSave?.(parentCrit.id, {
      code: code.trim() || suggestCode || "X1",
      description: description.trim(),
      notes: notes.trim(),
      score, target,
    });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="check-square" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Add an indicator</DialogTitle>
          <DialogDescription>
            {parentCrit ? <>Under <b style={{ color: "var(--foreground)" }}>{parentCrit.name}</b>. A specific, observable behaviour you can score.</> : null}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 10, marginBottom: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>Code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={suggestCode || "A1"} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Submits readable, well-structured PRs that need minimal stylistic feedback." autoFocus />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
          <span className="t-tag" style={{ fontSize: 9.5 }}>Notes <span style={{ color: "var(--muted-soft)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything that gives context for a reviewer." />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <span className="t-tag" style={{ fontSize: 9.5, display: "block", marginBottom: 6 }}>Target</span>
            <div style={{
              display: "inline-flex", padding: 3, gap: 0,
              background: "var(--surface-strong)", borderRadius: 999, border: "1px solid var(--border)"
            }}>
              {[1, 2, 3, 4].map((n) =>
              <button key={n} onClick={() => setTarget(n)} style={{
                minWidth: 32, height: 26, padding: "0 10px",
                borderRadius: 999, border: "none",
                background: target === n ? "var(--foreground)" : "transparent",
                color: target === n ? "var(--background)" : "var(--muted-foreground)",
                fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>{n}</button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6 }}>
              <b style={{ color: "var(--foreground)" }}>{window.CareerData.CAREER_LEGEND[target]}</b> — what the level expects here.
            </div>
          </div>
          <div>
            <span className="t-tag" style={{ fontSize: 9.5, display: "block", marginBottom: 6 }}>
              Initial score
            </span>
            <div style={{
              display: "inline-flex", padding: 3, gap: 0,
              background: "var(--surface-strong)", borderRadius: 999, border: "1px solid var(--border)"
            }}>
              {[1, 2, 3, 4].map((n) =>
              <button key={n} onClick={() => setScore(n)} style={{
                minWidth: 32, height: 26, padding: "0 10px",
                borderRadius: 999, border: "none",
                background: score === n ? "var(--primary)" : "transparent",
                color: score === n ? "var(--primary-foreground)" : "var(--muted-foreground)",
                fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>{n}</button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6 }}>
              {window.CareerData.CAREER_LEGEND[score]} — where you are today.
            </div>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="plus" onClick={save} disabled={!description.trim()}>
          Add indicator
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// All-evidence dialog (shows the full list when there are many)
// ============================================================
function EvidenceListDialog({ open, onOpenChange, indicator, onRemove, onAdd }) {
  if (!indicator) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="paperclip" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>All evidence · {indicator.evidence.length}</DialogTitle>
          <DialogDescription>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--foreground)" }}>{indicator.code}</span> — {indicator.description.slice(0, 80)}{indicator.description.length > 80 ? "…" : ""}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{
          maxHeight: 360, overflowY: "auto",
          border: "1px solid var(--border)", borderRadius: "var(--radius-md)"
        }}>
          {indicator.evidence.length === 0 ?
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)", fontSize: 12 }}>
              Nothing yet. Attach a link, note, project card, or Jira ticket.
            </div> :
          indicator.evidence.map((ev, i) =>
          <div key={ev.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center",
            padding: "10px 12px",
            borderTop: i ? "1px solid var(--hairline-soft)" : "none"
          }}>
              <span style={{
              width: 26, height: 26, borderRadius: 6,
              background: "var(--surface-strong)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted-foreground)"
            }}>
                {ev.kind === "jira" ? <SourceGlyph source="jira" size={14} /> :
              ev.kind === "text" ? <Icon name="quote" size={13} /> :
              ev.card_id ? <Icon name="layout-grid" size={13} /> :
              <Icon name="link-2" size={13} />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                fontSize: 13, fontWeight: 500, color: "var(--foreground)",
                fontStyle: ev.kind === "text" ? "italic" : "normal",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                  {ev.kind === "text" ? `“${ev.title}”` : ev.title}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {ev.kind === "link" ? "External link" :
                ev.kind === "text" ? "Note" :
                ev.kind === "project" ? "Project card" :
                ev.kind === "jira" ? "Jira ticket" :
                "Linked"}
                </div>
              </div>
              <IconButton icon="x" label="Remove" size="sm"
            onClick={() => onRemove?.(indicator.id, ev.id)} />
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Close</Button>
        <Button variant="primary" size="md" icon="plus" onClick={() => {onOpenChange(false);onAdd?.(indicator);}}>
          Attach more
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Comments thread dialog (per indicator)
// ============================================================
function CommentsDialog({ open, onOpenChange, indicator, onAddComment }) {
  const [draft, setDraft] = useCar("");
  useCarEffect(() => {if (open) setDraft("");}, [open]);
  if (!indicator) return null;
  const comments = indicator.comments || [];
  const submit = () => {
    if (!draft.trim()) return;
    onAddComment?.(indicator.id, draft.trim());
    setDraft("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="message-circle" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Comments · {comments.length}</DialogTitle>
          <DialogDescription>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--foreground)" }}>{indicator.code}</span> — {indicator.description.slice(0, 80)}{indicator.description.length > 80 ? "…" : ""}
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12,
          maxHeight: 280, overflowY: "auto" }}>
          {comments.length === 0 &&
          <div style={{
            padding: 18, textAlign: "center", fontSize: 12.5,
            color: "var(--muted-foreground)",
            border: "1px dashed var(--border)", borderRadius: "var(--radius-md)"
          }}>
              No comments yet. Threads are private to you until you share this level.
            </div>
          }
          {comments.map((c) =>
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10 }}>
              <div style={{
              width: 28, height: 28, borderRadius: 999,
              background: "var(--secondary)", color: "var(--foreground)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, border: "1px solid var(--border)"
            }}>{c.author_initials || "EK"}</div>
              <div>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" }}>{c.author || "Erin Kovacs"}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>{c.when || "just now"}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--foreground)", marginTop: 2, lineHeight: 1.5 }}>
                  {c.body}
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          padding: 10, borderRadius: "var(--radius-md)",
          background: "var(--surface-soft)", border: "1px solid var(--hairline)"
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start" }}>
            <div style={{
              width: 26, height: 26, borderRadius: 999,
              background: "var(--secondary)", color: "var(--foreground)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 600, border: "1px solid var(--border)"
            }}>EK</div>
            <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply or @mention a teammate…" rows={2}
            style={{
              width: "100%", padding: "5px 8px", fontSize: 13, lineHeight: 1.5,
              fontFamily: "inherit", color: "var(--foreground)",
              background: "var(--background)", border: "1px solid var(--input)",
              borderRadius: "var(--radius-sm)", outline: "none", resize: "vertical"
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" size="sm" icon="send" disabled={!draft.trim()} onClick={submit}>
              Send
            </Button>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Done</Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Development plan
// ============================================================
function DevPlanSection({ items, criteria, readOnly, onAdd, onUpdate, onRemove }) {
  const STATUS = {
    not_started: { label: "Not started", bg: "var(--surface-strong)", fg: "var(--muted-foreground)" },
    in_progress: { label: "In progress", bg: "var(--accent-tint)", fg: "var(--primary)" },
    done: { label: "Done", bg: "var(--good-soft)", fg: "var(--good)" },
    blocked: { label: "Blocked", bg: "var(--danger-soft)", fg: "var(--danger)" }
  };
  return (
    <section style={{
      marginTop: 18,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden"
    }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid var(--hairline)"
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, display: "inline-flex",
          alignItems: "center", justifyContent: "center",
          background: "var(--accent-tint)", color: "var(--primary)"
        }}>
          <Icon name="route" size={14} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--foreground)" }}>
            Development plan
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>
            Concrete items to close the gap toward target — with start and due dates.
          </div>
        </div>
        {!readOnly &&
        <Button variant="outline" size="sm" icon="plus" onClick={onAdd}>Add item</Button>
        }
      </header>
      <div>
        {items.length === 0 &&
        <button onClick={onAdd} style={{
          width: "calc(100% - 24px)", margin: "14px 12px", padding: "12px 14px",
          background: "transparent", border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-md)", color: "var(--muted-foreground)",
          fontSize: 12.5, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
        }}>
            <Icon name="plus" size={12} /> Add your first development plan item
          </button>
        }
        {items.map((it, i) => {
          const status = STATUS[it.status] || STATUS.not_started;
          const cr = criteria.find((c) => c.id === it.criterion_id);
          return (
            <div key={it.id} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 12,
              alignItems: "center", padding: "10px 16px",
              borderTop: i ? "1px solid var(--hairline-soft)" : "none"
            }}>
              <Icon name="target" size={14} style={{ color: "var(--muted-foreground)" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--foreground)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                {cr &&
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                    closes a gap in <span style={{ color: "var(--foreground)" }}>{cr.name}</span>
                  </div>
                }
              </div>
              <span className="t-mono" style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                {it.start} → {it.due}
              </span>
              <span style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                padding: "2px 8px", borderRadius: 999,
                background: status.bg, color: status.fg
              }}>{status.label}</span>
              {!readOnly &&
              <IconButton icon="more-horizontal" label="More" size="sm" onClick={() => onRemove?.(it.id)} />
              }
            </div>);

        })}
      </div>
    </section>);

}

function DevPlanAddDialog({ open, onOpenChange, criteria, onSave }) {
  const [title, setTitle] = useCar("");
  const [start, setStart] = useCar("");
  const [due, setDue] = useCar("");
  const [criterionId, setCriterionId] = useCar("");
  useCarEffect(() => {
    if (open) {
      setTitle("");setStart("");setDue("");setCriterionId(criteria[0]?.id || "");
    }
  }, [open]);
  const save = () => {
    if (!title.trim() || !start || !due) return;
    onSave?.({
      title: title.trim(),
      start: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      due: new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      status: "not_started",
      criterion_id: criterionId || null
    });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={520}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="route" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Add a development plan item</DialogTitle>
          <DialogDescription>What you're going to do, by when, to grow toward your target.</DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>Item</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lead RFC for v2 ingest pipeline" autoFocus />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>Start date</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              style={{
                height: 36, padding: "0 10px", fontSize: 13, color: "var(--foreground)",
                background: "var(--background)", border: "1px solid var(--input)",
                borderRadius: "var(--radius-md)", outline: "none", fontFamily: "inherit"
              }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="t-tag" style={{ fontSize: 9.5 }}>Due date</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              style={{
                height: 36, padding: "0 10px", fontSize: 13, color: "var(--foreground)",
                background: "var(--background)", border: "1px solid var(--input)",
                borderRadius: "var(--radius-md)", outline: "none", fontFamily: "inherit"
              }} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span className="t-tag" style={{ fontSize: 9.5 }}>Closes gap in <span style={{ color: "var(--muted-soft)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(optional)</span></span>
            <select value={criterionId} onChange={(e) => setCriterionId(e.target.value)}
            style={{
              height: 36, padding: "0 10px", fontSize: 13, color: "var(--foreground)",
              background: "var(--background)", border: "1px solid var(--input)",
              borderRadius: "var(--radius-md)", outline: "none", cursor: "pointer"
            }}>
              <option value="">— No specific criterion —</option>
              {criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="plus" onClick={save}
        disabled={!title.trim() || !start || !due}>
          Add item
        </Button>
      </DialogFooter>
    </Dialog>);

}

// ============================================================
// Score legend strip — explains what 1/2/3/4 mean. Editable.
// ============================================================
function ScoreLegendStrip({ legend, onEdit }) {
  return (
    <div style={{
      marginTop: 14, padding: "10px 14px",
      background: "var(--surface-soft)", border: "1px solid var(--hairline)",
      borderRadius: "var(--radius-md)",
      display: "grid", gridTemplateColumns: "auto repeat(4, 1fr) auto", gap: 14, alignItems: "center"
    }}>
      <span className="t-tag" style={{ fontSize: 9.5 }}>Legend</span>
      {[1, 2, 3, 4].map((n) => {
        const entry = legend[n] || { title: "", desc: "" };
        return (
          <div key={n} title={entry.desc} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
              {[1, 2, 3, 4].map((i) =>
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: 999,
                  border: i <= n ? "1px solid var(--primary)" : "1px solid var(--border-strong)",
                  background: i <= n ? "var(--primary)" : "transparent"
                }} />
              )}
            </span>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                {n} · {entry.title}
              </span>
              <span className="muted" style={{
                fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>{entry.desc}</span>
            </div>
          </div>
        );
      })}
      <Button variant="ghost" size="sm" icon="pencil" onClick={onEdit}>Edit</Button>
    </div>
  );
}

// Edit-legend modal — rename titles & descriptions
function LegendEditDialog({ open, onOpenChange, legend, onSave }) {
  const [draft, setDraft] = useCar(legend);
  useCarEffect(() => { if (open) setDraft(legend); }, [open, legend]);
  const update = (n, key, value) => setDraft((d) => ({ ...d, [n]: { ...d[n], [key]: value } }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} width={560}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-tint)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: "var(--primary)"
        }}>
          <Icon name="sliders" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <DialogTitle>Edit score legend</DialogTitle>
          <DialogDescription>
            Titles and one-line descriptions for scores 1–4. Stored on this level.
          </DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} style={{
              display: "grid", gridTemplateColumns: "32px 1fr 1.6fr", gap: 8, alignItems: "center",
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--primary)", color: "var(--primary-foreground)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
              }}>{n}</span>
              <Input
                value={draft[n]?.title || ""}
                onChange={(e) => update(n, "title", e.target.value)}
                placeholder="Title (e.g. Solid)" />
              <Input
                value={draft[n]?.desc || ""}
                onChange={(e) => update(n, "desc", e.target.value)}
                placeholder="One-line description" />
            </div>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" size="md" icon="check" onClick={() => { onSave?.(draft); onOpenChange(false); }}>
          Save legend
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ============================================================
// Wheel panel — now scoped to CRITERIA, not competencies
// ============================================================
function WheelPanel({ criteria, competencies }) {
  // Map criterion → its parent competency for grouping legend
  return (
    <div style={{
      position: "sticky", top: 12,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "14px 14px 16px"
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>The wheel</div>
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
          Per-criterion current vs. target · {criteria.length} criteria
        </div>
      </div>
      <CareerWheel data={criteria} variant="classic" />

      {/* competency legend — colored dots by parent competency */}
      {competencies && competencies.length > 0 &&
      <div style={{
        marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--hairline-soft)",
        display: "flex", flexWrap: "wrap", gap: "4px 10px",
        fontSize: 11, color: "var(--muted-foreground)"
      }}>
          {competencies.map((c) =>
        <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{
            width: 8, height: 8, borderRadius: 2, background: "var(--primary)",
            opacity: 0.55
          }} />
              <span>{c.name}</span>
              <span className="t-mono" style={{ color: "var(--muted-soft)" }}>· {c.criteria.length}</span>
            </span>
        )}
        </div>
      }

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
        fontSize: 11, color: "var(--muted-foreground)", marginTop: 8,
        paddingTop: 8, borderTop: "1px solid var(--hairline-soft)"
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--primary)", opacity: 0.6 }} /> Current
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 0, borderTop: "1.5px dashed var(--muted-foreground)" }} /> Target
        </span>
      </div>
    </div>);

}

// ============================================================
// Empty state
// ============================================================
function CareerEmpty({ onSeed, onBlank }) {
  return (
    <div style={{
      maxWidth: 720, margin: "48px auto", padding: 24,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)"
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: "var(--accent-tint)", color: "var(--primary)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 18 }}>
        <button onClick={onSeed} style={{
          textAlign: "left", padding: 16, borderRadius: "var(--radius-md)",
          background: "var(--surface-soft)", border: "1px solid var(--border)", cursor: "pointer"
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
          background: "transparent", border: "1px dashed var(--border-strong)", cursor: "pointer"
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
        fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8
      }}>
        <Icon name="info" size={12} /> Your data is private to your deployment — same RLS as Projects and Inbox.
      </div>
    </div>);

}

// ============================================================
// Archive grid + read-only view
// ============================================================
function ArchiveGrid({ levels, onOpen, onClone }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
      {levels.map((l) =>
      <div key={l.id} style={{
        background: "var(--surface-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 14, position: "relative"
      }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
            padding: "1px 7px", borderRadius: 999,
            background: "var(--surface-strong)", color: "var(--muted-foreground)",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase"
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
          borderBottom: "1px solid var(--hairline-soft)"
        }}>
            {[
          ["Comp.", l.summary.competencies],
          ["Crit.", l.summary.criteria],
          ["Ind.", l.summary.indicators],
          ["Avg", l.summary.current_avg.toFixed(1)]].
          map(([k, v]) =>
          <div key={k} style={{ textAlign: "center" }}>
                <div className="t-mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{v}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>{k}</div>
              </div>
          )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <Button variant="outline" size="sm" icon="eye" onClick={() => onOpen?.(l)} style={{ flex: 1 }}>Open</Button>
            <Button variant="outline" size="sm" icon="copy" onClick={() => onClone?.(l)} style={{ flex: 1 }}>Clone as template</Button>
          </div>
        </div>
      )}
    </div>);

}

// ============================================================
// Public read-only view
// ============================================================
function PublicShareView({ level, sat, criteriaData }) {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 48px" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
        paddingBottom: 12, borderBottom: "1px solid var(--hairline)"
      }}>
        <img src={window.__resources && window.__resources.devyLogo || "devy-logo.png"} alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>Shared via Devy · read-only</span>
        <span style={{ flex: 1 }} />
        <span style={{
          padding: "2px 8px", borderRadius: 999,
          background: "var(--surface-strong)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--muted-foreground)"
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
          {level.competencies.map((c) =>
          <CompetencyBlock key={c.id} comp={c} readOnly sat={sat.perCriterion} />
          )}
        </div>
        <WheelPanel
          criteria={criteriaData}
          competencies={level.competencies} />
      </div>

      <PublicCommentBox levelTitle={level.title} />
    </div>);

}

// Comment composer for the public share view — managers leave feedback without an account
function PublicCommentBox({ levelTitle }) {
  const [name, setName] = useCar("");
  const [scope, setScope] = useCar("level"); // level | competency
  const [scopeId, setScopeId] = useCar("");
  const [body, setBody] = useCar("");
  const [submitted, setSubmitted] = useCar([]);
  const submit = () => {
    if (!name.trim() || !body.trim()) return;
    setSubmitted((s) => [...s, {
      id: "pc_" + Date.now(),
      author: name.trim(), body: body.trim(), when: "just now", scope, scopeId
    }]);
    setBody("");
  };
  return (
    <section style={{
      marginTop: 28, padding: 18,
      background: "var(--surface-card)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Icon name="message-circle" size={16} style={{ color: "var(--primary)" }} />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>Leave feedback</h3>
        <span style={{ flex: 1 }} />
        <span className="t-mono" style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>
          delivered to Erin's Devy inbox
        </span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--muted-foreground)" }}>
        Comments on this read-only snapshot — no Devy account needed. {levelTitle} owner gets a Slack-self-DM and inbox entry for every reply.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (e.g. Priya M.)" />
        <select value={scope} onChange={(e) => setScope(e.target.value)}
        style={{
          height: 32, padding: "0 10px", fontSize: 13, color: "var(--foreground)",
          background: "var(--background)", border: "1px solid var(--input)",
          borderRadius: "var(--radius-md)", outline: "none", cursor: "pointer"
        }}>
          <option value="level">Whole level</option>
          <option value="competency">A specific competency…</option>
        </select>
      </div>

      <textarea value={body} onChange={(e) => setBody(e.target.value)}
      placeholder="Specific, actionable feedback works best."
      rows={3}
      style={{
        width: "100%", padding: "8px 10px", fontSize: 13, lineHeight: 1.5,
        fontFamily: "inherit", color: "var(--foreground)",
        background: "var(--background)", border: "1px solid var(--input)",
        borderRadius: "var(--radius-md)", outline: "none", resize: "vertical", marginBottom: 8
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11.5, color: "var(--muted-soft)" }}>
          Your name is shown to the level owner; nothing else is collected.
        </span>
        <Button variant="primary" size="md" icon="send" disabled={!name.trim() || !body.trim()} onClick={submit}>
          Send comment
        </Button>
      </div>

      {submitted.length > 0 &&
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hairline-soft)" }}>
          <div className="t-tag" style={{ marginBottom: 6 }}>Sent · {submitted.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {submitted.map((c) =>
          <div key={c.id} style={{
            padding: "8px 10px", borderRadius: "var(--radius-sm)",
            background: "var(--surface-soft)", border: "1px solid var(--hairline)"
          }}>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  <b style={{ color: "var(--foreground)" }}>{c.author}</b> · {c.when}
                </div>
                <div style={{ fontSize: 13, color: "var(--foreground)", marginTop: 3, lineHeight: 1.5 }}>
                  {c.body}
                </div>
              </div>
          )}
          </div>
        </div>
      }
    </section>);

}

// ============================================================
// Main Career page
// ============================================================
function CareerPage({ tweaks }) {
  const { ACTIVE_LEVEL, ARCHIVED_LEVELS, computeSatisfaction } = window.CareerData;

  // Local mutable level (so add-evidence / add-field / add-competency stick)
  const [level, setLevel] = useCar(() => JSON.parse(JSON.stringify(ACTIVE_LEVEL)));
  const [view, setView] = useCar("active"); // active | archive | archive-detail | empty | public
  const [archivedSelected, setArchivedSelected] = useCar(null);
  const [syncOpen, setSyncOpen] = useCar(false);
  const [syncMode, setSyncMode] = useCar("resync");
  const [shareOpen, setShareOpen] = useCar(false);
  const [shareToken, setShareToken] = useCar(ACTIVE_LEVEL.share_token);

  // add-flow modals
  const [evidenceFor, setEvidenceFor] = useCar(null);
  const [allEvidenceFor, setAllEvidenceFor] = useCar(null);
  const [commentsFor, setCommentsFor] = useCar(null);
  const [headerOpen, setHeaderOpen] = useCar(false);
  const [compOpen, setCompOpen] = useCar(false);
  const [critFor, setCritFor] = useCar(null); // parent competency obj
  const [indFor, setIndFor] = useCar(null); // parent criterion obj
  const [devOpen, setDevOpen] = useCar(false);
  const [careerTab, setCareerTab] = useCar("model"); // model | dev_plan
  const [legend, setLegend] = useCar(() => {
    const titles = window.CareerData.CAREER_LEGEND;
    const descs = window.CareerData.CAREER_LEGEND_DESC || {};
    return Object.fromEntries([1, 2, 3, 4].map((n) => [n, { title: titles[n] || "", desc: descs[n] || "" }]));
  });
  const [legendOpen, setLegendOpen] = useCar(false);

  const sat = useCarMemo(() => computeSatisfaction(level), [level]);

  // criteria data for the wheel (PRD comment: wheel should be per-criterion)
  const criteriaData = useCarMemo(() => {
    return level.competencies.flatMap((c) =>
    c.criteria.map((cr) => {
      const s = sat.perCriterion[cr.id] || { avg: 0, target: cr.target, gap: cr.target };
      return { id: cr.id, name: cr.name, current: s.avg, target: s.target, gap: s.gap };
    })
    );
  }, [level, sat]);

  const overall = useCarMemo(() => {
    const all = criteriaData;
    const avg = all.length ? all.reduce((s, p) => s + p.current, 0) / all.length : 0;
    const tar = all.length ? all.reduce((s, p) => s + p.target, 0) / all.length : 0;
    const atTarget = all.filter((c) => c.current >= c.target).length;
    return { avg, target: tar, atTarget, total: all.length };
  }, [criteriaData]);

  // ---- mutators ----
  const addEvidence = (indId, ev) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => ({
        ...cr,
        indicators: cr.indicators.map((i) => i.id === indId ?
        { ...i, evidence: [...i.evidence, { id: "e_" + Date.now(), ...ev }] } :
        i)
      }))
    }))
  }));
  const removeEvidence = (indId, evId) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => ({
        ...cr,
        indicators: cr.indicators.map((i) => i.id === indId ?
        { ...i, evidence: i.evidence.filter((e) => e.id !== evId) } :
        i)
      }))
    }))
  }));
  const setScore = (indId, score) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => ({
        ...cr,
        indicators: cr.indicators.map((i) => i.id === indId ? { ...i, score } : i)
      }))
    }))
  }));
  const addHeaderFields = (rows) => setLevel((L) => ({
    ...L, header: [...L.header, ...rows]
  }));
  const addCompetency = (name) => setLevel((L) => ({
    ...L,
    competencies: [...L.competencies, {
      id: "c_" + Date.now(), name, criteria: []
    }]
  }));
  const addCriterion = (compId, { name }) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => c.id === compId ?
    { ...c, criteria: [...c.criteria, {
        id: "cr_" + Date.now(), name, indicators: []
      }] } :
    c)
  }));
  const addIndicator = (crId, { code, description, notes, score, target }) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => cr.id === crId ?
      { ...cr, indicators: [...cr.indicators, {
          id: "i_" + Date.now(), code, description, notes: notes || "",
          score: Math.max(1, score || 1), target: target || 3, evidence: [], comments: []
        }] } :
      cr)
    }))
  }));

  // Add comment to an indicator
  const addComment = (indId, body) => setLevel((L) => ({
    ...L,
    competencies: L.competencies.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => ({
        ...cr,
        indicators: cr.indicators.map((i) => i.id === indId ?
        { ...i, comments: [...(i.comments || []), {
            id: "cm_" + Date.now(), author: "Erin Kovacs", author_initials: "EK",
            when: "just now", body
          }] } : i)
      }))
    }))
  }));

  // Development plan
  const devPlan = level.development_plan || [];
  const allCriteria = useCarMemo(() => level.competencies.flatMap((c) => c.criteria), [level]);
  const addDevItem = (item) => setLevel((L) => ({
    ...L,
    development_plan: [...(L.development_plan || []), { id: "dp_" + Date.now(), ...item }]
  }));
  const removeDevItem = (id) => setLevel((L) => ({
    ...L,
    development_plan: (L.development_plan || []).filter((it) => it.id !== id)
  }));

  // Keep dialog target indicator in sync with live tree
  const liveIndicator = useCarMemo(() => {
    const id = allEvidenceFor?.id || commentsFor?.id;
    if (!id) return null;
    for (const c of level.competencies)
    for (const cr of c.criteria)
    for (const i of cr.indicators)
    if (i.id === id) return i;
    return null;
  }, [level, allEvidenceFor, commentsFor]);

  // Suggest next indicator code (A1, A2, …) based on existing indicators in the criterion
  const suggestIndicatorCode = useCarMemo(() => {
    if (!indFor) return "";
    const used = new Set(indFor.indicators.map((i) => i.code));
    // pick letter prefix from existing or from criterion position
    const prefix = indFor.indicators[0]?.code?.[0] || "X";
    for (let n = 1; n < 20; n++) {
      const c = `${prefix}${n}`;
      if (!used.has(c)) return c;
    }
    return "";
  }, [indFor]);

  const previewPublic = () => setView("public");

  if (view === "empty") {
    return <CareerEmpty onSeed={() => setView("active")} onBlank={() => setView("active")} />;
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
          <Button variant="outline" size="sm" icon="x" onClick={() => setView("active")}>Exit preview</Button>
        </div>
        <PublicShareView level={level} sat={sat} criteriaData={criteriaData} />
      </div>);

  }

  return (
    <div style={{ padding: "16px 24px 32px", maxWidth: 1320, margin: "0 auto" }}>
      {/* Top header strip — switcher + sync pill + share/actions (Active/Archive tabs removed per feedback) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LevelSwitcher active={level} archived={ARCHIVED_LEVELS}
        onPickArchived={(a) => {setArchivedSelected(a);setView("archive-detail");}}
        onViewArchive={() => setView("archive")}
        onNewLevel={() => setView("empty")} />
        <SyncPill level={level}
        onOpenSync={() => {setSyncMode(level.sheet_id ? "resync" : "first");setSyncOpen(true);}} />
        <span style={{ flex: 1 }} />
        {view === "archive" || view === "archive-detail" ?
        <Button variant="outline" size="md" icon="arrow-left" onClick={() => setView("active")}>
            Back to active
          </Button> :

        <Button variant="outline" size="md" icon="share-2" onClick={() => setShareOpen(true)}>Share</Button>
        }
        <ActionsMenu
          onShare={() => setShareOpen(true)}
          onArchive={() => {}}
          onClone={() => {}}
          onUnlink={() => {}} />
        
      </div>

      {view === "archive" &&
      <div style={{ marginTop: 18 }}>
          <div className="t-tag" style={{ marginBottom: 10 }}>Archive · {ARCHIVED_LEVELS.length} levels</div>
          <ArchiveGrid levels={ARCHIVED_LEVELS}
        onOpen={(l) => {setArchivedSelected(l);setView("archive-detail");}}
        onClone={() => {}} />
        </div>
      }

      {view === "archive-detail" && archivedSelected &&
      <div style={{ marginTop: 18 }}>
          <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          padding: "10px 14px", borderRadius: "var(--radius-md)",
          background: "var(--surface-strong)", border: "1px solid var(--border)"
        }}>
            <Icon name="archive" size={14} />
            <span style={{ fontSize: 12.5 }}>
              <b>{archivedSelected.title}</b> · read-only snapshot · archived {archivedSelected.archived_at}
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="outline" size="sm" icon="copy">Clone as template</Button>
            <Button variant="outline" size="sm" icon="external-link">Open sheet</Button>
            <Button variant="outline" size="sm" icon="x" onClick={() => setView("archive")}>Close</Button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18, alignItems: "start" }}>
            <div>
              {level.competencies.map((c) =>
            <CompetencyBlock key={c.id} comp={c} readOnly sat={sat.perCriterion} />
            )}
            </div>
            <WheelPanel
            criteria={criteriaData}
            competencies={level.competencies} />
          </div>
        </div>
      }

      {view === "active" &&
      <>
          {/* Hero strip */}
          <div style={{
          marginTop: 14, padding: 16,
          display: "grid", gridTemplateColumns: "auto 1fr", gap: 16,
          background: "var(--surface-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)"
        }}>
            <div style={{
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "0 18px 0 4px", borderRight: "1px solid var(--hairline)", minWidth: 160
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
                {overall.atTarget} of {overall.total} criteria at target
              </div>
            </div>
            <HeaderKVs kvs={level.header} onAddField={() => setHeaderOpen(true)} />
          </div>

          {/* Career sub-tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, borderBottom: "1px solid var(--hairline)" }}>
            <Tabs
            value={careerTab}
            onValueChange={setCareerTab}
            items={[
            { value: "model", label: "Career model" },
            { value: "dev_plan", label: `Development plan · ${devPlan.length}` }]
            } />
            <span style={{ flex: 1 }} />
            {careerTab === "model" &&
          <>
                <Input icon="search" placeholder="Filter indicators…" style={{ width: 280 }} />
                <Button variant="outline" size="sm" icon="eye" onClick={previewPublic}>Preview public view</Button>
              </>
          }
            {careerTab === "dev_plan" &&
          <Button variant="primary" size="sm" icon="plus" onClick={() => setDevOpen(true)}>Add plan item</Button>
          }
          </div>

          {careerTab === "model" && <>
            {/* Legend strip — score → meaning */}
            <ScoreLegendStrip legend={legend} onEdit={() => setLegendOpen(true)} />

            {/* Body — always split */}
            <div style={{
            marginTop: 14, display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 18, alignItems: "start"
          }}>
              <div>
                {level.competencies.map((c) =>
              <CompetencyBlock key={c.id} comp={c} sat={sat.perCriterion}
              onAddEvidence={(ind) => setEvidenceFor(ind)}
              onRemoveEvidence={removeEvidence}
              onScoreChange={setScore}
              onAddCriterion={(comp) => setCritFor(comp)}
              onAddIndicator={(cr) => setIndFor(cr)}
              onShowAllEvidence={(ind) => setAllEvidenceFor(ind)}
              onShowComments={(ind) => setCommentsFor(ind)} />
              )}
                <button onClick={() => setCompOpen(true)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 14px",
                background: "transparent", border: "1px dashed var(--border-strong)",
                borderRadius: "var(--radius-lg)", color: "var(--muted-foreground)",
                fontSize: 13, cursor: "pointer", justifyContent: "center"
              }}
              onMouseEnter={(e) => {e.currentTarget.style.borderColor = "var(--primary)";e.currentTarget.style.color = "var(--primary)";}}
              onMouseLeave={(e) => {e.currentTarget.style.borderColor = "var(--border-strong)";e.currentTarget.style.color = "var(--muted-foreground)";}}>
                  <Icon name="plus" size={13} /> Add competency
                </button>
              </div>
              <WheelPanel
              criteria={criteriaData}
              competencies={level.competencies} />
            </div>
          </>}

          {careerTab === "dev_plan" &&
        <div style={{ marginTop: 14 }}>
              <DevPlanSection
            items={devPlan}
            criteria={allCriteria}
            onAdd={() => setDevOpen(true)}
            onRemove={removeDevItem} />
            </div>
        }
        </>
      }

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} level={level} mode={syncMode} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen}
      level={{ ...level, share_token: shareToken }}
      onGenerate={() => setShareToken(ACTIVE_LEVEL.share_token || "kxq2-8m9p-r4v0")}
      onRevoke={() => setShareToken(null)} />
      
      <EvidenceAddDialog
        open={!!evidenceFor}
        onOpenChange={(v) => {if (!v) setEvidenceFor(null);}}
        indicator={evidenceFor}
        onSave={(ev) => {if (evidenceFor) addEvidence(evidenceFor.id, ev);}} />
      
      <HeaderFieldDialog
        open={headerOpen}
        onOpenChange={setHeaderOpen}
        onSave={addHeaderFields} />
      
      <CompetencyAddDialog
        open={compOpen}
        onOpenChange={setCompOpen}
        onSave={addCompetency} />
      
      <CriterionAddDialog
        open={!!critFor}
        onOpenChange={(v) => {if (!v) setCritFor(null);}}
        parentComp={critFor}
        onSave={addCriterion} />
      
      <IndicatorAddDialog
        open={!!indFor}
        onOpenChange={(v) => {if (!v) setIndFor(null);}}
        parentCrit={indFor}
        suggestCode={suggestIndicatorCode}
        onSave={addIndicator} />

      <EvidenceListDialog
        open={!!allEvidenceFor}
        onOpenChange={(v) => {if (!v) setAllEvidenceFor(null);}}
        indicator={liveIndicator || allEvidenceFor}
        onRemove={removeEvidence}
        onAdd={(ind) => setEvidenceFor(ind)} />

      <CommentsDialog
        open={!!commentsFor}
        onOpenChange={(v) => {if (!v) setCommentsFor(null);}}
        indicator={liveIndicator || commentsFor}
        onAddComment={addComment} />

      <DevPlanAddDialog
        open={devOpen}
        onOpenChange={setDevOpen}
        criteria={allCriteria}
        onSave={addDevItem} />

      <LegendEditDialog
        open={legendOpen}
        onOpenChange={setLegendOpen}
        legend={legend}
        onSave={setLegend} />
      
    </div>);

}

window.CareerPage = CareerPage;