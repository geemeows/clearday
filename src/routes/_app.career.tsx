import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  LayoutGrid,
  Link2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "#/components/ui/button";
import { ActionsMenu } from "#/features/career/components/ActionsMenu";
import { CareerRadar } from "#/features/career/components/CareerRadar";
import { CareerSyncControls } from "#/features/career/components/CareerSyncControls";
import { ShareLinkDialog } from "#/features/career/components/ShareLinkDialog";
import { reorderWithinParent } from "#/features/career/order";
import {
  cloneArchivedLevelAsActive,
  createCompetency,
  createCriterion,
  createEvidence,
  createIndicator,
  createLevel,
  getActiveLevel,
  type LevelHeaderRow,
  listCompetencies,
  listCriteria,
  listEvidence,
  listIndicators,
  listLevels,
  renameCompetency,
  renameCriterion,
  renameIndicator,
  type StoredCompetency,
  type StoredCriterion,
  type StoredEvidence,
  type StoredIndicator,
  type StoredLevel,
  searchProjectCards,
  seedSampleTemplate,
  setCompetencyPosition,
  setCriterionPosition,
  setCriterionTarget,
  setEvidencePosition,
  setIndicatorPosition,
  setIndicatorScore,
  setLevelHeader,
  softDeleteCompetency,
  softDeleteCriterion,
  softDeleteEvidence,
  softDeleteIndicator,
  updateEvidence,
} from "#/features/career/store";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";

export const Route = createFileRoute("/_app/career")({
  component: CareerPage,
});

export function CareerPage() {
  const [active, setActive] = useState<StoredLevel | null | undefined>(
    undefined,
  );
  const [archived, setArchived] = useState<StoredLevel[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = supabase as unknown as SupabaseLike;

  useEffect(() => {
    let cancelled = false;
    // First-run seed: if no levels have ever existed (active or archived), write
    // the sample template so the user lands on a real tree instead of an empty
    // create-form. Archived levels count as "exists" so the seed never re-fires
    // after the user archives the sample.
    (async () => {
      try {
        const levels = await listLevels(client);
        if (levels.length === 0) {
          await seedSampleTemplate(client);
        }
        const refreshed = await listLevels(client);
        const active = await getActiveLevel(client);
        if (!cancelled) {
          setActive(active);
          setArchived(refreshed.filter((l) => l.status === "archived"));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (title: string) => {
    const id = crypto.randomUUID();
    try {
      await createLevel(client, { id, title });
      const level = await getActiveLevel(client);
      setActive(level);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create level");
    }
  };

  const handleCloneArchived = async (levelId: string, newTitle: string) => {
    try {
      await cloneArchivedLevelAsActive(client, levelId, newTitle);
      const refreshed = await listLevels(client);
      const next = await getActiveLevel(client);
      setActive(next);
      setArchived(refreshed.filter((l) => l.status === "archived"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to clone level");
    }
  };

  if (error) {
    return (
      <section className="mx-auto max-w-2xl p-8">
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      </section>
    );
  }

  if (active === undefined) {
    return (
      <section
        aria-busy="true"
        className="mx-auto max-w-2xl p-8 text-muted-foreground text-sm"
      >
        Loading…
      </section>
    );
  }

  if (active === null) {
    return (
      <CareerOnboardingView
        onCreateLevel={handleCreate}
        archivedLevels={archived}
        onCloneArchived={handleCloneArchived}
      />
    );
  }

  const viewing =
    (viewingId === null
      ? active
      : (archived.find((l) => l.id === viewingId) ?? active)) ?? active;

  return (
    <CareerLevelView
      level={viewing}
      activeLevel={active}
      archived={archived}
      client={client}
      onNewBlankLevel={(title) => {
        setViewingId(null);
        return handleCreate(title);
      }}
      onSelectLevel={(l) => setViewingId(l.id === active.id ? null : l.id)}
    />
  );
}

export function CareerOnboardingView({
  onCreateLevel,
  archivedLevels = [],
  onCloneArchived,
}: {
  onCreateLevel: (title: string) => void;
  archivedLevels?: StoredLevel[];
  onCloneArchived?: (levelId: string, newTitle: string) => void;
}) {
  const [title, setTitle] = useState("L4");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    onCreateLevel(title.trim());
  };

  return (
    <section className="mx-auto max-w-2xl p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl text-foreground tracking-tight">
            Career
          </h1>
          <p className="text-muted-foreground text-sm">
            Track competencies, criteria, and evidence across your career
            levels.
          </p>
        </div>
      </header>

      <section
        aria-label="Create level"
        className="rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h2 className="mb-1 font-semibold text-lg text-foreground">
          Create your first level
        </h2>
        <p className="mb-6 text-muted-foreground text-sm">
          A level is your current rung — e.g. "L4" or "Staff Engineer". You'll
          add competencies, criteria, and evidence under it.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="career-level-title"
              className="text-foreground text-sm font-medium"
            >
              Level name
            </label>
            <input
              id="career-level-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. L4"
              required
              disabled={submitting}
            />
          </div>

          <Button
            type="submit"
            disabled={!title.trim() || submitting}
            className="w-full"
          >
            {submitting ? "Creating…" : "Create level"}
          </Button>
        </form>
      </section>

      {archivedLevels.length > 0 && onCloneArchived && (
        <ArchivedLevelsPanel
          archivedLevels={archivedLevels}
          onCloneArchived={onCloneArchived}
        />
      )}
    </section>
  );
}

export function ArchivedLevelsPanel({
  archivedLevels,
  onCloneArchived,
}: {
  archivedLevels: StoredLevel[];
  onCloneArchived: (levelId: string, newTitle: string) => void;
}) {
  return (
    <section
      aria-label="Archived levels"
      className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="mb-1 font-semibold text-foreground text-lg">
        Archived levels
      </h2>
      <p className="mb-4 text-muted-foreground text-sm">
        Clone an archived level as a new starting template. Targets and
        structure carry over; scores reset and evidence is dropped.
      </p>
      <ul className="space-y-2">
        {archivedLevels.map((lvl) => (
          <ArchivedLevelRow
            key={lvl.id}
            level={lvl}
            onClone={(newTitle) => onCloneArchived(lvl.id, newTitle)}
          />
        ))}
      </ul>
    </section>
  );
}

function ArchivedLevelRow({
  level,
  onClone,
}: {
  level: StoredLevel;
  onClone: (newTitle: string) => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const client = supabase as unknown as SupabaseLike;
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-foreground text-sm">{level.title}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Generate share link for ${level.title}`}
          onClick={() => setShareOpen(true)}
        >
          Share
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Clone ${level.title} as starting template`}
          onClick={() => onClone(level.title)}
        >
          Clone as starting template
        </Button>
      </div>
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        levelId={level.id}
        client={client}
      />
    </li>
  );
}

export function CareerLevelView({
  level,
  client,
  activeLevel,
  archived = [],
  onNewBlankLevel,
  onSelectLevel,
}: {
  level: StoredLevel;
  client: SupabaseLike;
  activeLevel?: StoredLevel;
  archived?: StoredLevel[];
  onNewBlankLevel?: (title: string) => void;
  onSelectLevel?: (level: StoredLevel) => void;
}) {
  const [competencies, setCompetencies] = useState<StoredCompetency[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [scoreMode, setScoreMode] = useState<ScoreMode>("dots");
  const [sheetId, setSheetId] = useState<string | null>(level.sheet_id);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    level.last_synced_at,
  );

  useEffect(() => {
    let cancelled = false;
    listCompetencies(client, level.id)
      .then((rows) => {
        if (!cancelled) setCompetencies(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, level.id]);

  const handleAdd = async (name: string) => {
    const id = crypto.randomUUID();
    const position = (competencies?.length ?? 0) * 1024;
    try {
      await createCompetency(client, {
        id,
        level_id: level.id,
        name,
        position,
      });
      const rows = await listCompetencies(client, level.id);
      setCompetencies(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add competency");
    }
  };

  const handleRename = async (id: string, name: string) => {
    setCompetencies((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, name } : c)) : prev,
    );
    try {
      await renameCompetency(client, id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rename competency");
    }
  };

  const handleDelete = async (id: string) => {
    const target = competencies?.find((c) => c.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.name}" and all its children?`)) return;
    setCompetencies((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    try {
      await softDeleteCompetency(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete competency");
    }
  };

  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  const handleReorder = async (movedId: string, afterId: string | null) => {
    if (!competencies) return;
    const orderable = competencies.map((c) => ({
      id: c.id,
      position: c.position,
    }));
    const reordered = reorderWithinParent(orderable, movedId, afterId);
    if (reordered === orderable) return;
    const prev = competencies;
    const posMap = new Map(reordered.map((r) => [r.id, r.position]));
    setCompetencies((cs) =>
      cs
        ? [...cs]
            .map((c) => ({ ...c, position: posMap.get(c.id) ?? c.position }))
            .sort((a, b) => a.position - b.position)
        : cs,
    );
    try {
      await Promise.all(
        reordered.map((r) => setCompetencyPosition(client, r.id, r.position)),
      );
    } catch (e) {
      setCompetencies(prev);
      setError(e instanceof Error ? e.message : "failed to reorder");
    }
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = dragIdRef.current;
    const afterId = dropTargetIdRef.current;
    dragIdRef.current = null;
    dropTargetIdRef.current = null;
    if (!draggedId) return;
    handleReorder(draggedId, afterId);
  };

  return (
    <ScoreModeContext.Provider value={scoreMode}>
    <section className="mx-auto max-w-7xl p-8">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Target className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <LevelSwitcher
            active={activeLevel ?? level}
            current={level}
            archived={archived}
            onNewBlankLevel={onNewBlankLevel}
            onSelectLevel={onSelectLevel}
          />
          <p className="text-muted-foreground text-sm">
            Active level — add competencies to start building your tree.
          </p>
        </div>
        <ScoreModeToggle mode={scoreMode} onChange={setScoreMode} />
        <CareerSyncControls
          levelId={level.id}
          sheetId={sheetId}
          lastSyncedAt={lastSyncedAt}
          onChanged={(next) => {
            setSheetId(
              next.spreadsheetUrl
                ? (extractSheetId(next.spreadsheetUrl) ?? sheetId)
                : null,
            );
            setLastSyncedAt(next.lastSyncedAt);
          }}
        />
        <ActionsMenu
          onShare={() => setShareOpen(true)}
          onUnlink={
            sheetId
              ? async () => {
                  if (
                    !confirm(
                      "Unlink the Google Sheet? You can re-sync to create a new one.",
                    )
                  ) {
                    return;
                  }
                  try {
                    const res = await fetch("/api/career/unlink", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ level_id: level.id }),
                    });
                    if (!res.ok) {
                      const body = (await res.json().catch(() => ({}))) as {
                        error?: string;
                      };
                      setError(
                        body.error ?? `unlink failed (HTTP ${res.status})`,
                      );
                      return;
                    }
                    setSheetId(null);
                    setLastSyncedAt(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }
              : undefined
          }
        />
      </header>

      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        levelId={level.id}
        client={client}
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {error}
        </p>
      )}

      <LevelHeader level={level} client={client} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section
          aria-label="Competency tree"
          className="rounded-xl border border-border bg-card p-6 shadow-sm"
        >
          {competencies === null ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : competencies.length === 0 ? (
            <p className="mb-4 text-muted-foreground text-sm">
              No competencies yet.
            </p>
          ) : (
            <ul
              aria-label="Competencies"
              className="mb-4 space-y-3.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleListDrop}
            >
              {competencies.map((c) => (
                <CompetencyRow
                  key={c.id}
                  competency={c}
                  client={client}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onDragStart={() => {
                    dragIdRef.current = c.id;
                    dropTargetIdRef.current = null;
                  }}
                  onDragEnter={() => {
                    if (dragIdRef.current && dragIdRef.current !== c.id) {
                      dropTargetIdRef.current = c.id;
                    }
                  }}
                />
              ))}
            </ul>
          )}

          <AddCompetencyForm onAdd={handleAdd} />
        </section>

        <aside
          aria-label="Career radar"
          className="lg:sticky lg:top-8 lg:self-start"
        >
          <CareerRadar level={level} client={client} />
        </aside>
      </div>
    </section>
    </ScoreModeContext.Provider>
  );
}

export function LevelSwitcher({
  active,
  current,
  archived,
  onNewBlankLevel,
  onSelectLevel,
}: {
  active: StoredLevel;
  current?: StoredLevel;
  archived: StoredLevel[];
  onNewBlankLevel?: (title: string) => void;
  onSelectLevel?: (level: StoredLevel) => void;
}) {
  const viewing = current ?? active;
  const viewingIsActive = viewing.id === active.id;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Mockup splits the title on `·` so the lead segment (e.g. "L5") gets the
  // large bold treatment and the trailing segment (e.g. "Staff") sits next to
  // it in muted body type. Titles without `·` collapse to lead-only.
  const [titleLead, ...titleRest] = viewing.title.split("·");
  const titleTail = titleRest.join("·").trim();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleNewBlank = () => {
    setOpen(false);
    if (!onNewBlankLevel) return;
    const title = window.prompt("New level title", "L5");
    const trimmed = title?.trim();
    if (trimmed) onNewBlankLevel(trimmed);
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch level"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card py-[5px] pr-2.5 pl-3 text-foreground hover:bg-muted"
      >
        <span className="font-bold text-lg leading-none tracking-tight">
          {titleLead?.trim()}
        </span>
        {titleTail && (
          <span className="font-medium text-[13px] text-muted-foreground leading-none">
            {titleTail}
          </span>
        )}
        {viewingIsActive ? (
          <span
            className="rounded-full px-[7px] py-px font-bold text-[10px] uppercase tracking-wider"
            style={{
              background: "var(--good-soft)",
              color: "var(--good)",
            }}
          >
            Active
          </span>
        ) : (
          <span
            className="rounded-full px-[7px] py-px font-bold text-[10px] uppercase tracking-wider"
            style={{
              background: "var(--surface-soft)",
              color: "var(--muted-foreground)",
            }}
          >
            Archived
          </span>
        )}
        <ChevronDown className="h-[13px] w-[13px] text-muted-foreground" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Levels"
          className="absolute top-full left-0 z-30 mt-1.5 w-80 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          <p className="px-2.5 pt-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Active
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSelectLevel?.(active);
            }}
            className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-muted"
            style={
              viewingIsActive ? { background: "var(--accent-tint)" } : undefined
            }
          >
            <div className="font-semibold text-foreground text-sm">
              {active.title}
            </div>
            <div className="text-muted-foreground text-xs">
              Started {formatDateShort(active.created_at)}
            </div>
          </button>
          {archived.length > 0 && (
            <>
              <p className="px-2.5 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Archive
              </p>
              <ul aria-label="Archived levels list">
                {archived.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onSelectLevel?.(a);
                      }}
                      className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-muted"
                      style={
                        viewing.id === a.id
                          ? { background: "var(--accent-tint)" }
                          : undefined
                      }
                    >
                      <div className="font-medium text-foreground text-sm">
                        {a.title}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Archived {formatDateShort(a.archived_at)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {onNewBlankLevel && (
            <div className="mt-1 border-border border-t pt-1">
              <button
                type="button"
                onClick={handleNewBlank}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left font-medium text-primary text-sm hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> New blank level…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function LevelHeader({
  level,
  client,
}: {
  level: StoredLevel;
  client: SupabaseLike;
}) {
  const [rows, setRows] = useState<LevelHeaderRow[]>(level.header ?? []);
  const [error, setError] = useState<string | null>(null);

  const persist = async (next: LevelHeaderRow[]) => {
    setRows(next);
    try {
      await setLevelHeader(client, level.id, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to save header");
    }
  };

  const addRow = () => {
    persist([...rows, { key: "", value: "" }]);
  };

  const updateRow = (i: number, field: "key" | "value", v: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [field]: v } : r));
    if (next[i]?.[field] === rows[i]?.[field]) return;
    persist(next);
  };

  const deleteRow = (i: number) => {
    persist(rows.filter((_, idx) => idx !== i));
  };

  const moveRow = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    persist(next);
  };

  return (
    <section
      aria-label="Level header"
      className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-foreground text-sm">Header</h2>
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          Add row
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No header rows. Add role, employer, date, etc.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: header rows have no stable id; index is fine here
            <li key={i} className="flex items-center gap-2">
              <HeaderRow
                row={row}
                index={i}
                onRename={(v) => updateRow(i, "key", v)}
                onSetValue={(v) => updateRow(i, "value", v)}
                onDelete={() => deleteRow(i)}
                onMoveUp={i > 0 ? () => moveRow(i, -1) : undefined}
                onMoveDown={
                  i < rows.length - 1 ? () => moveRow(i, 1) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HeaderRow({
  row,
  index,
  onRename,
  onSetValue,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  row: LevelHeaderRow;
  index: number;
  onRename: (v: string) => void;
  onSetValue: (v: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [keyDraft, setKeyDraft] = useState(row.key);
  const [valueDraft, setValueDraft] = useState(row.value);
  // Re-sync drafts when the underlying row changes (e.g. after a reorder or
  // delete repositions sibling rows into this index slot).
  useEffect(() => {
    setKeyDraft(row.key);
  }, [row.key]);
  useEffect(() => {
    setValueDraft(row.value);
  }, [row.value]);
  const label = row.key || `row ${index + 1}`;

  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="text"
        aria-label={`Header key for ${label}`}
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={() => {
          if (keyDraft !== row.key) onRename(keyDraft);
        }}
        placeholder="Key"
        className="w-32 rounded border border-border bg-background px-2 py-1 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50"
      />
      <input
        type="text"
        aria-label={`Header value for ${label}`}
        value={valueDraft}
        onChange={(e) => setValueDraft(e.target.value)}
        onBlur={() => {
          if (valueDraft !== row.value) onSetValue(valueDraft);
        }}
        placeholder="Value"
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50"
      />
      <button
        type="button"
        aria-label={`Move ${label} up`}
        onClick={onMoveUp}
        disabled={!onMoveUp}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        <ArrowUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        onClick={onMoveDown}
        disabled={!onMoveDown}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        <ArrowDown className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete header row ${label}`}
        onClick={onDelete}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function CompetencyRow({
  competency,
  client,
  onRename,
  onDelete,
  onDragStart,
  onDragEnter,
}: {
  competency: StoredCompetency;
  client: SupabaseLike;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
}) {
  const [draft, setDraft] = useState(competency.name);
  const [criteriaCount, setCriteriaCount] = useState<number | null>(null);
  const [indicatorCount, setIndicatorCount] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      className="cursor-grab overflow-hidden rounded-lg border border-border bg-surface-card active:cursor-grabbing"
    >
      <header
        className="flex items-center gap-3 border-[var(--hairline)] border-b px-4 py-3"
        style={{
          background:
            "linear-gradient(180deg, var(--surface-soft) 0%, var(--surface-card) 100%)",
        }}
      >
        <GripVertical
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
        />
        <span
          aria-hidden="true"
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-primary font-bold text-[13px] text-primary-foreground"
        >
          {competency.name.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <input
            type="text"
            aria-label={`Rename competency ${competency.name}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const trimmed = draft.trim();
              if (trimmed && trimmed !== competency.name) {
                onRename(competency.id, trimmed);
              } else if (!trimmed) {
                setDraft(competency.name);
              }
            }}
            className="min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 font-semibold text-[14.5px] text-foreground outline-none focus:border-border focus:bg-muted"
          />
          {criteriaCount !== null && criteriaCount > 0 && (
            <div className="mt-px px-1.5 text-[11.5px] text-muted-foreground">
              {criteriaCount} {criteriaCount === 1 ? "criterion" : "criteria"}
              {indicatorCount !== null && indicatorCount > 0 && (
                <>
                  {" · "}
                  {indicatorCount}{" "}
                  {indicatorCount === 1 ? "indicator" : "indicators"}
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={`Add criterion to ${competency.name}`}
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 text-[12px] text-foreground hover:bg-muted"
        >
          <Plus aria-hidden="true" className="h-3 w-3" /> Criterion
        </button>
        <button
          type="button"
          aria-label={`Delete competency ${competency.name}`}
          onClick={() => onDelete(competency.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="px-1 pb-3.5">
        <CriteriaList
          competency={competency}
          client={client}
          showAddForm={showAddForm}
          onCriteriaCountChange={setCriteriaCount}
          onIndicatorCountChange={setIndicatorCount}
        />
      </div>
    </li>
  );
}

export function CriteriaList({
  competency,
  client,
  showAddForm,
  onCriteriaCountChange,
  onIndicatorCountChange,
}: {
  competency: StoredCompetency;
  client: SupabaseLike;
  showAddForm?: boolean;
  onCriteriaCountChange?: (count: number) => void;
  onIndicatorCountChange?: (count: number) => void;
}) {
  const [criteria, setCriteria] = useState<StoredCriterion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indicatorCounts, setIndicatorCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    let cancelled = false;
    listCriteria(client, competency.id)
      .then((rows) => {
        if (!cancelled) setCriteria(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, competency.id]);

  useEffect(() => {
    if (criteria !== null) onCriteriaCountChange?.(criteria.length);
  }, [criteria, onCriteriaCountChange]);

  useEffect(() => {
    if (criteria === null) return;
    const ids = new Set(criteria.map((c) => c.id));
    setIndicatorCounts((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [id, count] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = count;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [criteria]);

  useEffect(() => {
    if (criteria === null) return;
    const sum = criteria.reduce(
      (acc, c) => acc + (indicatorCounts[c.id] ?? 0),
      0,
    );
    onIndicatorCountChange?.(sum);
  }, [criteria, indicatorCounts, onIndicatorCountChange]);

  const reportIndicatorCount = useCallback((id: string, count: number) => {
    setIndicatorCounts((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  }, []);

  const handleAdd = async (name: string) => {
    const id = crypto.randomUUID();
    const position = (criteria?.length ?? 0) * 1024;
    try {
      await createCriterion(client, {
        id,
        competency_id: competency.id,
        name,
        target: 1,
        position,
      });
      const rows = await listCriteria(client, competency.id);
      setCriteria(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add criterion");
    }
  };

  const handleRename = async (id: string, name: string) => {
    setCriteria((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, name } : c)) : prev,
    );
    try {
      await renameCriterion(client, id, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to rename criterion");
    }
  };

  const handleSetTarget = async (id: string, target: number) => {
    setCriteria((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, target } : c)) : prev,
    );
    try {
      await setCriterionTarget(client, id, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update target");
    }
  };

  const handleDelete = async (id: string) => {
    const target = criteria?.find((c) => c.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.name}" and its indicators / evidence?`))
      return;
    setCriteria((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    try {
      await softDeleteCriterion(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete criterion");
    }
  };

  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  const handleReorder = async (movedId: string, afterId: string | null) => {
    if (!criteria) return;
    const orderable = criteria.map((c) => ({ id: c.id, position: c.position }));
    const reordered = reorderWithinParent(orderable, movedId, afterId);
    if (reordered === orderable) return;
    const prev = criteria;
    const posMap = new Map(reordered.map((r) => [r.id, r.position]));
    setCriteria((cs) =>
      cs
        ? [...cs]
            .map((c) => ({ ...c, position: posMap.get(c.id) ?? c.position }))
            .sort((a, b) => a.position - b.position)
        : cs,
    );
    try {
      await Promise.all(
        reordered.map((r) => setCriterionPosition(client, r.id, r.position)),
      );
    } catch (e) {
      setCriteria(prev);
      setError(e instanceof Error ? e.message : "failed to reorder");
    }
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = dragIdRef.current;
    const afterId = dropTargetIdRef.current;
    dragIdRef.current = null;
    dropTargetIdRef.current = null;
    if (!draggedId) return;
    handleReorder(draggedId, afterId);
  };

  const addFormVisible = showAddForm ?? true;

  return (
    <div className="mt-2 ml-4 space-y-2 border-border border-l pl-4">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {addFormVisible && <AddCriterionForm onAdd={handleAdd} />}
      {criteria === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : criteria.length === 0 ? null : (
        <ul
          aria-label="Criteria"
          className="space-y-1.5"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleListDrop}
        >
          {criteria.map((c, i) => (
            <CriterionRow
              key={c.id}
              criterion={c}
              letter={String.fromCharCode(65 + i)}
              client={client}
              onRename={handleRename}
              onSetTarget={handleSetTarget}
              onDelete={handleDelete}
              onIndicatorCountChange={(count) =>
                reportIndicatorCount(c.id, count)
              }
              onDragStart={() => {
                dragIdRef.current = c.id;
                dropTargetIdRef.current = null;
              }}
              onDragEnter={() => {
                if (dragIdRef.current && dragIdRef.current !== c.id) {
                  dropTargetIdRef.current = c.id;
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type ScoreMode = "dots" | "chips";

const ScoreModeContext = createContext<ScoreMode>("dots");

function ScoreChips({
  value,
  max = 4,
  onChange,
  label,
}: {
  value: number;
  max?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0 rounded-full border border-border bg-[var(--surface-strong)] p-0.5"
    >
      {Array.from({ length: max }).map((_, idx) => {
        const chipValue = idx + 1;
        const active = chipValue === value;
        return (
          <button
            key={chipValue}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}: ${chipValue}`}
            onClick={() => {
              if (chipValue !== value) onChange(chipValue);
            }}
            className={
              active
                ? "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-[11px] text-primary-foreground transition-all"
                : "inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-transparent px-1.5 font-semibold text-[11px] text-muted-foreground transition-all"
            }
          >
            {chipValue}
          </button>
        );
      })}
    </div>
  );
}

function ScoreControl(props: {
  value: number;
  max?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const mode = useContext(ScoreModeContext);
  return mode === "chips" ? <ScoreChips {...props} /> : <ScoreDots {...props} />;
}

function ScoreModeToggle({
  mode,
  onChange,
}: {
  mode: ScoreMode;
  onChange: (next: ScoreMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Score display mode"
      className="inline-flex items-center gap-0 rounded-full border border-border bg-[var(--surface-strong)] p-0.5"
    >
      {(["dots", "chips"] as const).map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Score display mode: ${m}`}
            onClick={() => {
              if (m !== mode) onChange(m);
            }}
            className={
              active
                ? "inline-flex h-[22px] items-center rounded-full bg-primary px-2.5 font-medium text-[11px] text-primary-foreground capitalize transition-all"
                : "inline-flex h-[22px] items-center rounded-full bg-transparent px-2.5 font-medium text-[11px] text-muted-foreground capitalize transition-all"
            }
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

function ScoreDots({
  value,
  max = 4,
  onChange,
  label,
}: {
  value: number;
  max?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-1"
    >
      {Array.from({ length: max }).map((_, idx) => {
        const dotValue = idx + 1;
        const filled = dotValue <= value;
        return (
          <button
            key={dotValue}
            type="button"
            role="radio"
            aria-checked={value === dotValue}
            aria-label={`${label}: ${dotValue}`}
            onClick={() => {
              if (dotValue !== value) onChange(dotValue);
            }}
            className={
              filled
                ? "h-[11px] w-[11px] rounded-full border border-primary bg-primary p-0 transition-all"
                : "h-[11px] w-[11px] rounded-full border border-border bg-transparent p-0 transition-all"
            }
          />
        );
      })}
      <span className="ml-1.5 min-w-[26px] font-mono text-[11px] text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

function CriterionRow({
  criterion,
  letter,
  client,
  onRename,
  onSetTarget,
  onDelete,
  onIndicatorCountChange,
  onDragStart,
  onDragEnter,
}: {
  criterion: StoredCriterion;
  letter: string;
  client: SupabaseLike;
  onRename: (id: string, name: string) => void;
  onSetTarget: (id: string, target: number) => void;
  onDelete: (id: string) => void;
  onIndicatorCountChange?: (count: number) => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
}) {
  const [draft, setDraft] = useState(criterion.name);
  const [indicatorScores, setIndicatorScores] = useState<number[]>([]);
  const avg =
    indicatorScores.length > 0
      ? indicatorScores.reduce((s, v) => s + v, 0) / indicatorScores.length
      : null;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      className="cursor-grab rounded-md border border-border bg-card px-2.5 py-1.5 active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <GripVertical
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-muted-foreground/60"
        />
        <span
          aria-hidden="true"
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-xs bg-[var(--surface-strong)] font-bold text-[11px] text-muted-foreground"
        >
          {letter}
        </span>
        <input
          type="text"
          aria-label={`Rename criterion ${criterion.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const trimmed = draft.trim();
            if (trimmed && trimmed !== criterion.name) {
              onRename(criterion.id, trimmed);
            } else if (!trimmed) {
              setDraft(criterion.name);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-sm outline-none focus:border-border focus:bg-muted"
        />
        {avg !== null && (
          <span
            aria-label={`Criterion satisfaction ${avg.toFixed(1)} of ${criterion.target}`}
            className="inline-flex shrink-0 items-center rounded-xs border border-[var(--hairline)] bg-[var(--surface-strong)] px-1.5 py-px font-mono font-semibold text-[10.5px] text-muted-foreground"
          >
            {avg.toFixed(1)}
            <span className="ml-1 text-[var(--muted-soft)]">
              / {criterion.target}
            </span>
          </span>
        )}
        <ScoreControl
          value={criterion.target}
          onChange={(next) => onSetTarget(criterion.id, next)}
          label={`Target for ${criterion.name}`}
        />
        <button
          type="button"
          aria-label={`Delete criterion ${criterion.name}`}
          onClick={() => onDelete(criterion.id)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <IndicatorList
        criterion={criterion}
        client={client}
        onIndicatorCountChange={onIndicatorCountChange}
        onIndicatorScoresChange={setIndicatorScores}
      />
    </li>
  );
}

export function IndicatorList({
  criterion,
  client,
  onIndicatorCountChange,
  onIndicatorScoresChange,
}: {
  criterion: StoredCriterion;
  client: SupabaseLike;
  onIndicatorCountChange?: (count: number) => void;
  onIndicatorScoresChange?: (scores: number[]) => void;
}) {
  const [indicators, setIndicators] = useState<StoredIndicator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listIndicators(client, criterion.id)
      .then((rows) => {
        if (!cancelled) setIndicators(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, criterion.id]);

  useEffect(() => {
    if (indicators !== null) {
      onIndicatorCountChange?.(indicators.length);
      onIndicatorScoresChange?.(indicators.map((i) => i.score));
    }
  }, [indicators, onIndicatorCountChange, onIndicatorScoresChange]);

  const handleAdd = async (description: string) => {
    const id = crypto.randomUUID();
    const position = (indicators?.length ?? 0) * 1024;
    try {
      await createIndicator(client, {
        id,
        criterion_id: criterion.id,
        description,
        position,
      });
      const rows = await listIndicators(client, criterion.id);
      setIndicators(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add indicator");
    }
  };

  const handleRename = async (
    id: string,
    fields: {
      code?: string | null;
      description?: string;
      notes?: string | null;
    },
  ) => {
    setIndicators((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, ...fields } : i)) : prev,
    );
    try {
      await renameIndicator(client, id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update indicator");
    }
  };

  const handleSetScore = async (id: string, score: number) => {
    setIndicators((prev) =>
      prev ? prev.map((i) => (i.id === id ? { ...i, score } : i)) : prev,
    );
    try {
      await setIndicatorScore(client, id, score);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update score");
    }
  };

  const handleDelete = async (id: string) => {
    const target = indicators?.find((i) => i.id === id);
    if (!target) return;
    const label = target.code || target.description || "indicator";
    if (!confirm(`Delete "${label}" and its evidence?`)) return;
    setIndicators((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    try {
      await softDeleteIndicator(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete indicator");
    }
  };

  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  const handleReorder = async (movedId: string, afterId: string | null) => {
    if (!indicators) return;
    const orderable = indicators.map((i) => ({
      id: i.id,
      position: i.position,
    }));
    const reordered = reorderWithinParent(orderable, movedId, afterId);
    if (reordered === orderable) return;
    const prev = indicators;
    const posMap = new Map(reordered.map((r) => [r.id, r.position]));
    setIndicators((cs) =>
      cs
        ? [...cs]
            .map((c) => ({ ...c, position: posMap.get(c.id) ?? c.position }))
            .sort((a, b) => a.position - b.position)
        : cs,
    );
    try {
      await Promise.all(
        reordered.map((r) => setIndicatorPosition(client, r.id, r.position)),
      );
    } catch (e) {
      setIndicators(prev);
      setError(e instanceof Error ? e.message : "failed to reorder");
    }
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = dragIdRef.current;
    const afterId = dropTargetIdRef.current;
    dragIdRef.current = null;
    dropTargetIdRef.current = null;
    if (!draggedId) return;
    handleReorder(draggedId, afterId);
  };

  return (
    <div className="mt-2 ml-4 space-y-1.5 border-border border-l pl-3">
      {error && (
        <p
          role="alert"
          className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      {indicators === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : indicators.length === 0 ? null : (
        <ul
          aria-label="Indicators"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleListDrop}
        >
          {indicators.map((i) => (
            <IndicatorRow
              key={i.id}
              indicator={i}
              client={client}
              onRename={handleRename}
              onSetScore={handleSetScore}
              onDelete={handleDelete}
              onDragStart={() => {
                dragIdRef.current = i.id;
                dropTargetIdRef.current = null;
              }}
              onDragEnter={() => {
                if (dragIdRef.current && dragIdRef.current !== i.id) {
                  dropTargetIdRef.current = i.id;
                }
              }}
            />
          ))}
        </ul>
      )}
      <AddIndicatorForm onAdd={handleAdd} />
    </div>
  );
}

function IndicatorRow({
  indicator,
  client,
  onRename,
  onSetScore,
  onDelete,
  onDragStart,
  onDragEnter,
}: {
  indicator: StoredIndicator;
  client: SupabaseLike;
  onRename: (
    id: string,
    fields: {
      code?: string | null;
      description?: string;
      notes?: string | null;
    },
  ) => void;
  onSetScore: (id: string, score: number) => void;
  onDelete: (id: string) => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
}) {
  const [codeDraft, setCodeDraft] = useState(indicator.code ?? "");
  const [descDraft, setDescDraft] = useState(indicator.description);
  const [notesDraft, setNotesDraft] = useState(indicator.notes ?? "");

  const label = indicator.code || indicator.description;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      className="grid cursor-grab grid-cols-[auto_1fr_auto] items-start gap-3.5 border-[var(--hairline-soft)] border-t py-2.5 pr-3.5 pl-2 active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5 pt-0.5">
        <GripVertical
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-[var(--muted-soft)] opacity-70"
        />
        <input
          type="text"
          aria-label={`Code for ${label}`}
          value={codeDraft}
          onChange={(e) => setCodeDraft(e.target.value)}
          onBlur={() => {
            const trimmed = codeDraft.trim();
            const next = trimmed === "" ? null : trimmed;
            if (next !== (indicator.code ?? null)) {
              onRename(indicator.id, { code: next });
            }
          }}
          placeholder="A"
          className="w-12 rounded-[4px] border border-transparent bg-[var(--surface-strong)] px-1.5 py-px text-center font-mono font-semibold text-[11px] text-muted-foreground tracking-[0.3px] outline-none focus:border-border focus:bg-muted focus:text-foreground"
        />
      </div>
      <div className="min-w-0">
        <input
          type="text"
          aria-label={`Description for ${label}`}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            const trimmed = descDraft.trim();
            if (trimmed && trimmed !== indicator.description) {
              onRename(indicator.id, { description: trimmed });
            } else if (!trimmed) {
              setDescDraft(indicator.description);
            }
          }}
          className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] text-foreground leading-snug outline-none focus:border-border focus:bg-muted"
        />
        <EvidenceList
          indicator={indicator}
          client={client}
          notes={{
            value: notesDraft,
            onChange: setNotesDraft,
            onBlur: () => {
              const trimmed = notesDraft.trim();
              const next = trimmed === "" ? null : trimmed;
              if (next !== (indicator.notes ?? null)) {
                onRename(indicator.id, { notes: next });
              }
            },
            label: `Notes for ${label}`,
          }}
        />
      </div>
      <div className="flex items-center gap-1 pt-px">
        <ScoreControl
          value={indicator.score}
          onChange={(next) => onSetScore(indicator.id, next)}
          label={`Score for ${label}`}
        />
        <button
          type="button"
          aria-label={`Delete indicator ${label}`}
          onClick={() => onDelete(indicator.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

export function EvidenceList({
  indicator,
  client,
  notes,
}: {
  indicator: StoredIndicator;
  client: SupabaseLike;
  notes?: {
    value: string;
    onChange: (v: string) => void;
    onBlur: () => void;
    label: string;
  };
}) {
  const [evidence, setEvidence] = useState<StoredEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listEvidence(client, indicator.id)
      .then((rows) => {
        if (!cancelled) setEvidence(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [client, indicator.id]);

  const handleAdd = async (title: string) => {
    const id = crypto.randomUUID();
    const position = (evidence?.length ?? 0) * 1024;
    try {
      await createEvidence(client, {
        id,
        indicator_id: indicator.id,
        title,
        position,
      });
      const rows = await listEvidence(client, indicator.id);
      setEvidence(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to add evidence");
    }
  };

  const handleUpdate = async (
    id: string,
    fields: {
      title?: string;
      url?: string | null;
      note?: string | null;
      card_id?: string | null;
    },
  ) => {
    setEvidence((prev) =>
      prev
        ? prev.map((ev) => (ev.id === id ? { ...ev, ...fields } : ev))
        : prev,
    );
    try {
      await updateEvidence(client, id, fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update evidence");
    }
  };

  const handleDelete = async (id: string) => {
    const target = evidence?.find((ev) => ev.id === id);
    if (!target) return;
    if (!confirm(`Delete "${target.title}"?`)) return;
    setEvidence((prev) => (prev ? prev.filter((ev) => ev.id !== id) : prev));
    try {
      await softDeleteEvidence(client, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete evidence");
    }
  };

  const dragIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  const handleReorder = async (movedId: string, afterId: string | null) => {
    if (!evidence) return;
    const orderable = evidence.map((ev) => ({
      id: ev.id,
      position: ev.position,
    }));
    const reordered = reorderWithinParent(orderable, movedId, afterId);
    if (reordered === orderable) return;
    const prev = evidence;
    const posMap = new Map(reordered.map((r) => [r.id, r.position]));
    setEvidence((cs) =>
      cs
        ? [...cs]
            .map((c) => ({ ...c, position: posMap.get(c.id) ?? c.position }))
            .sort((a, b) => a.position - b.position)
        : cs,
    );
    try {
      await Promise.all(
        reordered.map((r) => setEvidencePosition(client, r.id, r.position)),
      );
    } catch (e) {
      setEvidence(prev);
      setError(e instanceof Error ? e.message : "failed to reorder");
    }
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = dragIdRef.current;
    const afterId = dropTargetIdRef.current;
    dragIdRef.current = null;
    dropTargetIdRef.current = null;
    if (!draggedId) return;
    handleReorder(draggedId, afterId);
  };

  return (
    <div className="mt-1.5">
      {error && (
        <p
          role="alert"
          className="mb-1.5 rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {evidence === null ? (
          <p className="text-muted-foreground text-xs">Loading…</p>
        ) : (
          <>
            {evidence.map((ev) => (
              <EvidenceChip key={ev.id} ev={ev} />
            ))}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={
                open ? "Hide evidence editor" : "Show evidence editor"
              }
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] border-dashed bg-transparent px-1.5 py-px text-[11.5px] text-muted-foreground hover:bg-muted"
            >
              <Plus aria-hidden="true" className="h-2.5 w-2.5" />
              Evidence
            </button>
            {notes && (
              <label className="ml-0.5 inline-flex min-w-0 flex-1 items-baseline gap-1 text-[11.5px] text-muted-foreground italic">
                <span aria-hidden="true">—</span>
                <input
                  type="text"
                  aria-label={notes.label}
                  value={notes.value}
                  onChange={(e) => notes.onChange(e.target.value)}
                  onBlur={notes.onBlur}
                  placeholder="Notes…"
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-px text-[11.5px] text-muted-foreground italic outline-none focus:border-border focus:bg-muted"
                />
              </label>
            )}
          </>
        )}
      </div>
      {open && evidence !== null && (
        <div className="mt-2 ml-3 space-y-1.5 border-border border-l pl-3">
          {evidence.length > 0 && (
            <ul
              aria-label="Evidence"
              className="space-y-1"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleListDrop}
            >
              {evidence.map((ev) => (
                <EvidenceRow
                  key={ev.id}
                  evidence={ev}
                  client={client}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onDragStart={() => {
                    dragIdRef.current = ev.id;
                    dropTargetIdRef.current = null;
                  }}
                  onDragEnter={() => {
                    if (dragIdRef.current && dragIdRef.current !== ev.id) {
                      dropTargetIdRef.current = ev.id;
                    }
                  }}
                />
              ))}
            </ul>
          )}
          <AddEvidenceForm onAdd={handleAdd} />
        </div>
      )}
    </div>
  );
}

function EvidenceChip({ ev }: { ev: StoredEvidence }) {
  const IconComp = ev.card_id ? LayoutGrid : Link2;
  const chipClass =
    "inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full border border-[var(--hairline)] bg-[var(--surface-strong)] px-1.5 py-px font-medium text-[11.5px] text-foreground no-underline";
  const inner = (
    <>
      <IconComp aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{ev.title}</span>
    </>
  );
  if (ev.url) {
    return (
      <a
        href={ev.url}
        target="_blank"
        rel="noopener noreferrer"
        title={ev.title}
        className={chipClass}
      >
        {inner}
      </a>
    );
  }
  return (
    <span title={ev.title} className={chipClass}>
      {inner}
    </span>
  );
}

function EvidenceRow({
  evidence,
  client,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnter,
}: {
  evidence: StoredEvidence;
  client: SupabaseLike;
  onUpdate: (
    id: string,
    fields: {
      title?: string;
      url?: string | null;
      note?: string | null;
      card_id?: string | null;
    },
  ) => void;
  onDelete: (id: string) => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(evidence.title);
  const [urlDraft, setUrlDraft] = useState(evidence.url ?? "");
  const [noteDraft, setNoteDraft] = useState(evidence.note ?? "");

  const isValidUrl = (s: string) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      className="cursor-grab rounded-md border border-border bg-card px-2 py-1.5 active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <GripVertical
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-muted-foreground/60"
        />
        <input
          type="text"
          aria-label={`Title for ${evidence.title}`}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const trimmed = titleDraft.trim();
            if (trimmed && trimmed !== evidence.title) {
              onUpdate(evidence.id, { title: trimmed });
            } else if (!trimmed) {
              setTitleDraft(evidence.title);
            }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        <button
          type="button"
          aria-label={`Delete evidence ${evidence.title}`}
          onClick={() => onDelete(evidence.id)}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="url"
          aria-label={`URL for ${evidence.title}`}
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onBlur={() => {
            const trimmed = urlDraft.trim();
            const next = trimmed === "" ? null : trimmed;
            if (next !== null && !isValidUrl(next)) {
              setUrlDraft(evidence.url ?? "");
              return;
            }
            if (next !== (evidence.url ?? null)) {
              onUpdate(evidence.id, { url: next });
            }
          }}
          placeholder="https://…"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
        />
        {evidence.url && (
          <a
            href={evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${evidence.title} link`}
            className="text-primary text-xs underline"
          >
            open
          </a>
        )}
      </div>
      <input
        type="text"
        aria-label={`Note for ${evidence.title}`}
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          const trimmed = noteDraft.trim();
          const next = trimmed === "" ? null : trimmed;
          if (next !== (evidence.note ?? null)) {
            onUpdate(evidence.id, { note: next });
          }
        }}
        placeholder="Note…"
        className="mt-1 w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
      />
      <CardPicker
        evidence={evidence}
        client={client}
        onPick={(card_id) => onUpdate(evidence.id, { card_id })}
      />
    </li>
  );
}

export function CardPicker({
  evidence,
  client,
  onPick,
}: {
  evidence: StoredEvidence;
  client: SupabaseLike;
  onPick: (cardId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; title: string }>>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchProjectCards(client, query)
      .then((rows) => {
        if (!cancelled) setResults(rows);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, query]);

  return (
    <div className="mt-1 flex items-center gap-2">
      {evidence.card_id ? (
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          Linked card
          <button
            type="button"
            aria-label={`Unlink card from ${evidence.title}`}
            onClick={() => onPick(null)}
            className="rounded px-1 text-primary underline"
          >
            unlink
          </button>
        </span>
      ) : (
        <div className="relative flex-1">
          <input
            type="text"
            aria-label={`Search project cards for ${evidence.title}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Link a project card…"
            className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-muted-foreground text-xs outline-none focus:border-border focus:bg-muted"
          />
          {results.length > 0 && (
            <ul
              aria-label={`Card search results for ${evidence.title}`}
              className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(r.id);
                      setQuery("");
                      setResults([]);
                    }}
                    className="w-full rounded px-2 py-1 text-left text-foreground text-xs hover:bg-muted"
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AddEvidenceForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New evidence title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add evidence…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!title.trim()} size="sm">
        Add evidence
      </Button>
    </form>
  );
}

export function AddIndicatorForm({
  onAdd,
}: {
  onAdd: (description: string) => void;
}) {
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDescription("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New indicator description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add indicator…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!description.trim()} size="sm">
        Add indicator
      </Button>
    </form>
  );
}

export function AddCriterionForm({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New criterion name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add criterion…"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!name.trim()} size="sm">
        Add criterion
      </Button>
    </form>
  );
}

export function AddCompetencyForm({
  onAdd,
}: {
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="text"
        aria-label="New competency name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Engineering Excellence"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <Button type="submit" disabled={!name.trim()}>
        Add competency
      </Button>
    </form>
  );
}

// Best-effort id extraction from a Google Sheets URL: handles both the
// /d/{id}/edit and /d/{id} forms. Returns null when the URL has no /d/{id}.
function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
