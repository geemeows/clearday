// CareerPage — main orchestrator for the Career feature.
// Local state only (no Supabase wiring) for the redesign pass.

import { useMemo, useState } from "react";
import { EyeIcon, PlusIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Tabs, TabsList, TabsTab } from "#/components/ui/tabs";
import {
  ACTIVE_LEVEL,
  ARCHIVED_LEVELS,
  CAREER_LEGEND,
  CAREER_LEGEND_DESC,
  computeSatisfaction,
} from "./career-data";
import type {
  ArchivedLevel,
  CareerLevel,
  Competency,
  Criterion,
  Evidence,
  Indicator,
  ScoreLegend,
  WheelDataPoint,
} from "./career-data";
import { CareerEmpty } from "./CareerEmpty";
import { ArchiveGrid, ArchiveDetailView } from "./ArchiveView";
import { PublicShareView } from "./PublicShareView";
import { CompetencyBlock } from "./CompetencyBlock";
import { WheelPanel } from "./WheelPanel";
import { HeaderKVs, LevelSwitcher, SyncPill, ActionsMenu } from "./CareerHeader";
import { ScoreLegendStrip } from "./ScoreLegendStrip";
import { DevPlanSection } from "./DevPlanSection";
import {
  SyncDialog,
  ShareDialog,
  EvidenceAddDialog,
  EvidenceListDialog,
  HeaderFieldDialog,
  CompetencyAddDialog,
  CriterionAddDialog,
  IndicatorAddDialog,
  CommentsDialog,
  DevPlanAddDialog,
  LegendEditDialog,
} from "./CareerDialogs";

type View = "active" | "archive" | "archive-detail" | "empty" | "public";

function buildInitialLegend(): ScoreLegend {
  return Object.fromEntries(
    [1, 2, 3, 4].map((n) => [
      n,
      { title: CAREER_LEGEND[n] ?? "", desc: CAREER_LEGEND_DESC[n] ?? "" },
    ]),
  );
}

export function CareerPage() {
  const [level, setLevel] = useState<CareerLevel>(() =>
    JSON.parse(JSON.stringify(ACTIVE_LEVEL)),
  );
  const [view, setView] = useState<View>("active");
  const [archivedSelected, setArchivedSelected] = useState<ArchivedLevel | null>(null);
  const [careerTab, setCareerTab] = useState<string>("model");
  const [legend, setLegend] = useState<ScoreLegend>(buildInitialLegend);

  // dialog open states
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<"first" | "resync">("resync");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(ACTIVE_LEVEL.share_token);
  const [evidenceFor, setEvidenceFor] = useState<Indicator | null>(null);
  const [allEvidenceFor, setAllEvidenceFor] = useState<Indicator | null>(null);
  const [commentsFor, setCommentsFor] = useState<Indicator | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [critFor, setCritFor] = useState<Competency | null>(null);
  const [indFor, setIndFor] = useState<Criterion | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  // derived
  const sat = useMemo(() => computeSatisfaction(level), [level]);

  const criteriaData = useMemo<WheelDataPoint[]>(
    () =>
      level.competencies.flatMap((c) =>
        c.criteria.map((cr) => {
          const s = sat.perCriterion[cr.id] ?? { avg: 0, target: cr.target, gap: cr.target };
          return { id: cr.id, name: cr.name, current: s.avg, target: s.target, gap: s.gap };
        }),
      ),
    [level, sat],
  );

  const overall = useMemo(() => {
    const all = criteriaData;
    const avg = all.length ? all.reduce((s, p) => s + p.current, 0) / all.length : 0;
    const tar = all.length ? all.reduce((s, p) => s + p.target, 0) / all.length : 0;
    const atTarget = all.filter((c) => c.current >= c.target).length;
    return { avg, target: tar, atTarget, total: all.length };
  }, [criteriaData]);

  const allCriteria = useMemo<Criterion[]>(
    () => level.competencies.flatMap((c) => c.criteria),
    [level],
  );

  const suggestIndicatorCode = useMemo(() => {
    if (!indFor) return "";
    const used = new Set(indFor.indicators.map((i) => i.code));
    const prefix = indFor.indicators[0]?.code?.[0] ?? "X";
    for (let n = 1; n < 20; n++) {
      const c = `${prefix}${n}`;
      if (!used.has(c)) return c;
    }
    return "";
  }, [indFor]);

  const liveIndicator = useMemo(() => {
    const id = allEvidenceFor?.id ?? commentsFor?.id;
    if (!id) return null;
    for (const c of level.competencies)
      for (const cr of c.criteria)
        for (const i of cr.indicators)
          if (i.id === id) return i;
    return null;
  }, [level, allEvidenceFor, commentsFor]);

  // ── mutators ────────────────────────────────────────────────────────────────

  const addEvidence = (indId: string, ev: Omit<Evidence, "id">) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) => ({
        ...c,
        criteria: c.criteria.map((cr) => ({
          ...cr,
          indicators: cr.indicators.map((i) =>
            i.id === indId
              ? { ...i, evidence: [...i.evidence, { id: `e_${Date.now()}`, ...ev }] }
              : i,
          ),
        })),
      })),
    }));

  const removeEvidence = (indId: string, evId: string) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) => ({
        ...c,
        criteria: c.criteria.map((cr) => ({
          ...cr,
          indicators: cr.indicators.map((i) =>
            i.id === indId ? { ...i, evidence: i.evidence.filter((e) => e.id !== evId) } : i,
          ),
        })),
      })),
    }));

  const setScore = (indId: string, score: number) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) => ({
        ...c,
        criteria: c.criteria.map((cr) => ({
          ...cr,
          indicators: cr.indicators.map((i) => (i.id === indId ? { ...i, score } : i)),
        })),
      })),
    }));

  const addHeaderFields = (rows: Array<{ key: string; value: string }>) =>
    setLevel((L) => ({ ...L, header: [...L.header, ...rows] }));

  const addCompetency = (name: string) =>
    setLevel((L) => ({
      ...L,
      competencies: [...L.competencies, { id: `c_${Date.now()}`, name, criteria: [] }],
    }));

  const addCriterion = (compId: string, { name }: { name: string }) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) =>
        c.id === compId
          ? { ...c, criteria: [...c.criteria, { id: `cr_${Date.now()}`, name, target: 3, indicators: [] }] }
          : c,
      ),
    }));

  const addIndicator = (
    crId: string,
    {
      code,
      description,
      notes,
      score,
      target,
    }: { code: string; description: string; notes?: string; score?: number; target?: number },
  ) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) => ({
        ...c,
        criteria: c.criteria.map((cr) =>
          cr.id === crId
            ? {
                ...cr,
                indicators: [
                  ...cr.indicators,
                  {
                    id: `i_${Date.now()}`,
                    code,
                    description,
                    notes: notes ?? "",
                    score: Math.max(1, score ?? 1),
                    target: target ?? 3,
                    evidence: [],
                    comments: [],
                  },
                ],
              }
            : cr,
        ),
      })),
    }));

  const addComment = (indId: string, body: string) =>
    setLevel((L) => ({
      ...L,
      competencies: L.competencies.map((c) => ({
        ...c,
        criteria: c.criteria.map((cr) => ({
          ...cr,
          indicators: cr.indicators.map((i) =>
            i.id === indId
              ? {
                  ...i,
                  comments: [
                    ...(i.comments ?? []),
                    {
                      id: `cm_${Date.now()}`,
                      author: "You",
                      author_initials: "YO",
                      when: "just now",
                      body,
                    },
                  ],
                }
              : i,
          ),
        })),
      })),
    }));

  const devPlan: NonNullable<CareerLevel["development_plan"]> = level.development_plan ?? [];

  const addDevItem = (item: {
    title: string;
    start: string;
    due: string;
    status: string;
    criterion_id: string | null;
  }) =>
    setLevel((L) => ({
      ...L,
      development_plan: [
        ...(L.development_plan ?? []),
        {
          id: `dp_${Date.now()}`,
          title: item.title,
          start: item.start,
          due: item.due,
          status: item.status as import("./career-data").DevPlanStatus,
          criterion_id: item.criterion_id,
        },
      ],
    }));

  const removeDevItem = (id: string) =>
    setLevel((L) => ({
      ...L,
      development_plan: (L.development_plan ?? []).filter((it) => it.id !== id),
    }));

  // ── views ────────────────────────────────────────────────────────────────────

  if (view === "empty") {
    return (
      <CareerEmpty
        onSeed={() => setView("active")}
        onBlank={() => setView("active")}
      />
    );
  }

  if (view === "public") {
    return (
      <div style={{ minHeight: "100%", background: "var(--background)" }}>
        <div
          className="sticky top-0 z-[5] px-6 py-2 flex items-center gap-2.5 text-[12px] border-b"
          style={{
            background: "var(--surface-strong)",
            borderColor: "var(--border)",
          }}
        >
          <EyeIcon className="size-3.5" />
          <span>Previewing the public share view</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setView("active")}>
            Exit preview
          </Button>
        </div>
        <PublicShareView
          level={level}
          satPerCriterion={sat.perCriterion}
          criteriaData={criteriaData}
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-4 pb-8 max-w-[1320px] mx-auto">
      {/* Top header strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <LevelSwitcher
          active={level}
          archived={ARCHIVED_LEVELS}
          onPickArchived={(a) => {
            setArchivedSelected(a);
            setView("archive-detail");
          }}
          onViewArchive={() => setView("archive")}
          onNewLevel={() => setView("empty")}
        />
        <SyncPill
          level={level}
          onOpenSync={() => {
            setSyncMode(level.sheet_id ? "resync" : "first");
            setSyncOpen(true);
          }}
        />
        <span className="flex-1" />
        {view === "archive" || view === "archive-detail" ? (
          <Button variant="outline" onClick={() => setView("active")}>
            ← Back to active
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            Share
          </Button>
        )}
        <ActionsMenu
          onShare={() => setShareOpen(true)}
          onArchive={() => {}}
          onClone={() => {}}
          onUnlink={() => {}}
        />
      </div>

      {/* Archive grid */}
      {view === "archive" && (
        <div className="mt-4.5">
          <div
            className="text-[9.5px] uppercase tracking-wider font-semibold mb-2.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Archive · {ARCHIVED_LEVELS.length} levels
          </div>
          <ArchiveGrid
            levels={ARCHIVED_LEVELS}
            onOpen={(l) => {
              setArchivedSelected(l);
              setView("archive-detail");
            }}
            onClone={() => {}}
          />
        </div>
      )}

      {/* Archive detail */}
      {view === "archive-detail" && archivedSelected && (
        <ArchiveDetailView
          level={archivedSelected}
          competencies={level.competencies}
          criteriaData={criteriaData}
          satPerCriterion={sat.perCriterion}
        />
      )}

      {/* Active view */}
      {view === "active" && (
        <>
          {/* Hero strip */}
          <div
            className="mt-3.5 p-4 grid gap-4 rounded-lg border"
            style={{
              gridTemplateColumns: "auto 1fr",
              background: "var(--surface-card)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="flex flex-col justify-center px-4 pl-1 min-w-[160px]"
              style={{ borderRight: "1px solid var(--hairline)" }}
            >
              <div
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Current overall
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[36px] font-bold tracking-[-1px] text-foreground">
                  {overall.avg.toFixed(1)}
                </span>
                <span
                  className="text-[14px] font-medium"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  / {overall.target.toFixed(1)} target
                </span>
              </div>
              <div
                className="mt-1.5 text-[12px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {overall.atTarget} of {overall.total} criteria at target
              </div>
            </div>
            <HeaderKVs kvs={level.header} onAddField={() => setHeaderOpen(true)} />
          </div>

          {/* Career sub-tabs */}
          <div
            className="flex items-center gap-2 mt-3.5"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <Tabs value={careerTab} onValueChange={setCareerTab}>
              <TabsList>
                <TabsTab value="model">Career model</TabsTab>
                <TabsTab value="dev_plan">
                  Development plan · {devPlan.length}
                </TabsTab>
              </TabsList>
            </Tabs>
            <span className="flex-1" />
            {careerTab === "model" && (
              <>
                <Input
                  placeholder="Filter indicators…"
                  className="w-[280px]"
                  aria-label="Filter indicators"
                />
                <Button variant="outline" size="sm" onClick={() => setView("public")}>
                  <EyeIcon /> Preview public view
                </Button>
              </>
            )}
            {careerTab === "dev_plan" && (
              <Button size="sm" onClick={() => setDevOpen(true)}>
                <PlusIcon /> Add plan item
              </Button>
            )}
          </div>

          {careerTab === "model" && (
            <>
              <ScoreLegendStrip legend={legend} onEdit={() => setLegendOpen(true)} />
              <div
                className="mt-3.5 grid gap-4.5 items-start"
                style={{ gridTemplateColumns: "1.6fr 1fr" }}
              >
                <div>
                  {level.competencies.map((c) => (
                    <CompetencyBlock
                      key={c.id}
                      comp={c}
                      sat={sat.perCriterion}
                      onAddEvidence={(ind) => setEvidenceFor(ind)}
                      onRemoveEvidence={removeEvidence}
                      onScoreChange={setScore}
                      onAddCriterion={(comp) => setCritFor(comp)}
                      onAddIndicator={(cr) => setIndFor(cr)}
                      onShowAllEvidence={(ind) => setAllEvidenceFor(ind)}
                      onShowComments={(ind) => setCommentsFor(ind)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCompOpen(true)}
                    className="flex items-center gap-2 w-full px-3.5 py-3 border cursor-pointer justify-center text-[13px] rounded-lg mt-3"
                    style={{
                      background: "transparent",
                      borderStyle: "dashed",
                      borderColor: "var(--border-strong)",
                      color: "var(--muted-foreground)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.color = "var(--primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-strong)";
                      e.currentTarget.style.color = "var(--muted-foreground)";
                    }}
                  >
                    <PlusIcon className="size-3.5" /> Add competency
                  </button>
                </div>
                <WheelPanel
                  criteria={criteriaData}
                  competencies={level.competencies}
                />
              </div>
            </>
          )}

          {careerTab === "dev_plan" && (
            <div className="mt-3.5">
              <DevPlanSection
                items={devPlan}
                criteria={allCriteria}
                onAdd={() => setDevOpen(true)}
                onRemove={removeDevItem}
              />
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} level={level} mode={syncMode} />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        level={{ ...level, share_token: shareToken }}
        onGenerate={() => setShareToken(ACTIVE_LEVEL.share_token ?? "kxq2-8m9p-r4v0")}
        onRevoke={() => setShareToken(null)}
      />

      <EvidenceAddDialog
        open={!!evidenceFor}
        onOpenChange={(v) => { if (!v) setEvidenceFor(null); }}
        indicator={evidenceFor}
        onSave={(ev) => {
          if (evidenceFor) addEvidence(evidenceFor.id, ev);
        }}
      />

      <EvidenceListDialog
        open={!!allEvidenceFor}
        onOpenChange={(v) => { if (!v) setAllEvidenceFor(null); }}
        indicator={liveIndicator ?? allEvidenceFor}
        onRemove={(evId) => {
          const ind = liveIndicator ?? allEvidenceFor;
          if (ind) removeEvidence(ind.id, evId);
        }}
        onAdd={() => {
          const ind = liveIndicator ?? allEvidenceFor;
          if (ind) setEvidenceFor(ind);
        }}
      />

      <CommentsDialog
        open={!!commentsFor}
        onOpenChange={(v) => { if (!v) setCommentsFor(null); }}
        indicator={liveIndicator ?? commentsFor}
        onAddComment={addComment}
      />

      <HeaderFieldDialog
        open={headerOpen}
        onOpenChange={setHeaderOpen}
        onSave={addHeaderFields}
      />

      <CompetencyAddDialog
        open={compOpen}
        onOpenChange={setCompOpen}
        onSave={addCompetency}
      />

      <CriterionAddDialog
        open={!!critFor}
        onOpenChange={(v) => { if (!v) setCritFor(null); }}
        parentComp={critFor}
        onSave={addCriterion}
      />

      <IndicatorAddDialog
        open={!!indFor}
        onOpenChange={(v) => { if (!v) setIndFor(null); }}
        parentCrit={indFor}
        suggestCode={suggestIndicatorCode}
        onSave={addIndicator}
      />

      <DevPlanAddDialog
        open={devOpen}
        onOpenChange={setDevOpen}
        criteria={allCriteria}
        onSave={addDevItem}
      />

      <LegendEditDialog
        open={legendOpen}
        onOpenChange={setLegendOpen}
        legend={legend}
        onSave={setLegend}
      />
    </div>
  );
}
