// ProjectsPage — Redesign v5 / Wire data — Projects (#191)
// Kanban board: board view, project switcher, column CRUD, card detail, signal linking.

import {
  ChevronDownIcon,
  LinkIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { Textarea } from "#/components/ui/textarea";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import { supabase } from "#/lib/supabase";
import type { SupabaseLike } from "#/shared/db";
import {
  createProject,
  createColumn,
  createCard,
  updateCard as storeUpdateCard,
  updateColumn as storeUpdateColumn,
  deleteColumn as storeDeleteColumn,
  linkSignalToCard,
  unlinkSignal as storeUnlinkSignal,
  type CardPatch,
} from "#/features/projects/store";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CardPriority = "P1" | "P2" | "P3";
export type CardDue = "today" | "tomorrow" | "this-week" | null;

export type LinkedTicket = {
  source: string;
  id: string;
  repo: string;
};

export type ProjectCard = {
  id: string;
  col: string;
  title: string;
  desc: string;
  priority: CardPriority;
  labels: string[];
  due: CardDue;
  linked: LinkedTicket | null;
  linkedSignals: string[];
};

export type KanbanColumnDef = {
  id: string;
  name: string;
};

export type ProjectDef = {
  id: string;
  name: string;
  color: string;
  activeCol: string;
  columns: KanbanColumnDef[];
  cards: ProjectCard[];
};

export type FixtureSignal = {
  id: string;
  source: string;
  title: string;
  repo?: string;
  num?: string;
  sub?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityStyle(p: CardPriority): { bg: string; color: string } {
  if (p === "P1") return { bg: "var(--danger-soft)", color: "var(--danger)" };
  if (p === "P2") return { bg: "var(--warn-soft)", color: "var(--warn)" };
  return { bg: "var(--surface-strong)", color: "var(--muted-foreground)" };
}

function dueToDueAt(due: CardDue): string | null {
  if (!due) return null;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (due === "tomorrow") d.setDate(d.getDate() + 1);
  else if (due === "this-week") d.setDate(d.getDate() + 3);
  return d.toISOString();
}

// ── ProjectsPage ──────────────────────────────────────────────────────────────

export function ProjectsPage({
  initialProjects = [],
  availableSignals = [],
}: {
  initialProjects?: ProjectDef[];
  availableSignals?: FixtureSignal[];
} = {}) {
  const db = supabase as unknown as SupabaseLike;

  const [projects, setProjects] = useState<ProjectDef[]>(initialProjects);
  const [activeId, setActiveId] = useState(initialProjects[0]?.id ?? "");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [editingColumns, setEditingColumns] = useState(false);
  const [linkPickerCardId, setLinkPickerCardId] = useState<string | null>(null);

  const project = projects.find((p) => p.id === activeId) ?? projects[0];

  const updateProject = (id: string, fn: (p: ProjectDef) => ProjectDef) =>
    setProjects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  const handleMoveCard = (cardId: string, toCol: string) => {
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) => (c.id === cardId ? { ...c, col: toCol } : c)),
    }));
    storeUpdateCard(db, cardId, { column_id: toCol }).catch(console.error);
  };

  const handleAddCard = (colId: string) => {
    const newId = crypto.randomUUID();
    const proj = projects.find((p) => p.id === activeId);
    if (!proj) return;
    const newCard: ProjectCard = {
      id: newId,
      col: colId,
      title: "Untitled",
      desc: "",
      priority: "P3",
      labels: [],
      due: null,
      linked: null,
      linkedSignals: [],
    };
    updateProject(activeId, (p) => ({
      ...p,
      cards: [...p.cards, newCard],
    }));
    createCard(db, {
      id: newId,
      project_id: activeId,
      column_id: colId,
      order: proj.cards.length,
      title: "Untitled",
    }).catch(console.error);
  };

  const handleUpdateCard = (cardId: string, patch: Partial<ProjectCard>) => {
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    }));
    const storePatch: CardPatch = {};
    if (patch.title !== undefined) storePatch.title = patch.title;
    if (patch.desc !== undefined) storePatch.body = patch.desc;
    if (patch.priority !== undefined) storePatch.priority = patch.priority;
    if (patch.labels !== undefined) storePatch.tags = patch.labels;
    if (patch.due !== undefined) storePatch.due_at = dueToDueAt(patch.due);
    if (patch.col !== undefined) storePatch.column_id = patch.col;
    if (Object.keys(storePatch).length > 0) {
      storeUpdateCard(db, cardId, storePatch).catch(console.error);
    }
  };

  const handleLinkSignal = (cardId: string, sigId: string) => {
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) =>
        c.id === cardId
          ? {
              ...c,
              linkedSignals: c.linkedSignals.includes(sigId)
                ? c.linkedSignals
                : [...c.linkedSignals, sigId],
            }
          : c,
      ),
    }));
    linkSignalToCard(db, sigId, cardId, activeId).catch(console.error);
  };

  const handleUnlinkSignal = (cardId: string, sigId: string) => {
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) =>
        c.id === cardId
          ? { ...c, linkedSignals: c.linkedSignals.filter((s) => s !== sigId) }
          : c,
      ),
    }));
    storeUnlinkSignal(db, sigId).catch(console.error);
  };

  const handleSaveColumns = (newCols: KanbanColumnDef[]) => {
    const proj = projects.find((p) => p.id === activeId);
    if (!proj) return;
    const oldCols = proj.columns;
    const newColIds = new Set(newCols.map((c) => c.id));
    const deletedCols = oldCols.filter((c) => !newColIds.has(c.id));

    updateProject(activeId, (p) => ({
      ...p,
      columns: newCols,
      // cards whose column was deleted fall to first remaining column
      cards: p.cards.map((c) =>
        newColIds.has(c.col)
          ? c
          : { ...c, col: newCols[0]?.id ?? c.col },
      ),
    }));
    setEditingColumns(false);

    for (const c of deletedCols) {
      storeDeleteColumn(db, c.id).catch(console.error);
    }
    newCols.forEach((c, i) => {
      const existing = oldCols.find((old) => old.id === c.id);
      if (!existing) {
        createColumn(db, {
          id: c.id,
          project_id: activeId,
          name: c.name,
          order: i,
        }).catch(console.error);
      } else if (existing.name !== c.name || oldCols.indexOf(existing) !== i) {
        storeUpdateColumn(db, c.id, { name: c.name, order: i }).catch(
          console.error,
        );
      }
    });
  };

  const openCard = project?.cards.find((c) => c.id === openCardId) ?? null;

  // Empty state — no projects loaded yet
  if (projects.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          height: "100%",
        }}
      >
        <p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
          No projects yet. Create one to get started.
        </p>
        <Button onClick={() => setCreatingProject(true)} type="button">
          <PlusIcon size={14} aria-hidden />
          New project
        </Button>

        <Dialog open={creatingProject} onOpenChange={setCreatingProject}>
          <NewProjectDialog
            onClose={() => setCreatingProject(false)}
            onCreate={(np) => {
              setProjects([np]);
              setActiveId(np.id);
              setCreatingProject(false);
              createProject(db, { id: np.id, name: np.name }).catch(
                console.error,
              );
              np.columns.forEach((col, i) =>
                createColumn(db, {
                  id: col.id,
                  project_id: np.id,
                  name: col.name,
                  order: i,
                }).catch(console.error),
              );
            }}
          />
        </Dialog>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 28px 14px",
          borderBottom: "1px solid var(--hairline-soft)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <ProjectSwitcher
          projects={projects}
          activeId={activeId}
          setActiveId={setActiveId}
          onNew={() => setCreatingProject(true)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditingColumns(true)}
          type="button"
          aria-label="Edit columns"
        >
          <SettingsIcon size={13} aria-hidden />
          Edit columns
        </Button>
        <span style={{ flex: 1 }} />
        <span
          style={{ fontSize: 12, color: "var(--muted-foreground)" }}
          aria-label="project stats"
        >
          {project?.cards.length ?? 0} cards ·{" "}
          {project?.columns.length ?? 0} columns
        </span>
      </div>

      {/* Board */}
      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "20px 20px 28px",
        }}
        aria-label="kanban board"
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            height: "100%",
            minWidth: (project?.columns.length ?? 0) * 294,
          }}
        >
          {project?.columns.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              project={project}
              cards={project.cards.filter((c) => c.col === col.id)}
              onMove={handleMoveCard}
              onAdd={() => handleAddCard(col.id)}
              onOpen={(c) => setOpenCardId(c.id)}
            />
          ))}
          {/* Add column button */}
          <button
            type="button"
            onClick={() => setEditingColumns(true)}
            aria-label="Add column"
            style={{
              flexShrink: 0,
              width: 180,
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1.5px dashed var(--border)",
              background: "transparent",
              color: "var(--muted-foreground)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
            className="hover:bg-accent"
          >
            <PlusIcon size={13} aria-hidden />
            Add column
          </button>
        </div>
      </div>

      {/* New project dialog */}
      <Dialog open={creatingProject} onOpenChange={setCreatingProject}>
        <NewProjectDialog
          onClose={() => setCreatingProject(false)}
          onCreate={(np) => {
            setProjects((ps) => [...ps, np]);
            setActiveId(np.id);
            setCreatingProject(false);
            createProject(db, { id: np.id, name: np.name }).catch(
              console.error,
            );
            np.columns.forEach((col, i) =>
              createColumn(db, {
                id: col.id,
                project_id: np.id,
                name: col.name,
                order: i,
              }).catch(console.error),
            );
          }}
        />
      </Dialog>

      {/* Edit columns dialog */}
      {project && (
        <Dialog open={editingColumns} onOpenChange={setEditingColumns}>
          <EditColumnsDialog
            project={project}
            onClose={() => setEditingColumns(false)}
            onSave={handleSaveColumns}
          />
        </Dialog>
      )}

      {/* Card detail dialog */}
      <Dialog
        open={openCardId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenCardId(null);
        }}
      >
        {openCard && project && (
          <CardDetailDialog
            card={openCard}
            project={project}
            allSignals={availableSignals}
            onUpdate={(patch) => handleUpdateCard(openCard.id, patch)}
            onLinkSignal={() => {
              setLinkPickerCardId(openCard.id);
              setOpenCardId(null);
            }}
            onUnlinkSignal={(sigId) => handleUnlinkSignal(openCard.id, sigId)}
          />
        )}
      </Dialog>

      {/* Signal link picker dialog */}
      <Dialog
        open={linkPickerCardId !== null}
        onOpenChange={(open) => {
          if (!open) setLinkPickerCardId(null);
        }}
      >
        {linkPickerCardId && project && (
          <SignalLinkPickerDialog
            signals={availableSignals}
            alreadyLinked={
              project.cards.find((c) => c.id === linkPickerCardId)
                ?.linkedSignals ?? []
            }
            onPick={(sigId) => {
              handleLinkSignal(linkPickerCardId, sigId);
              setLinkPickerCardId(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// ── ProjectSwitcher ───────────────────────────────────────────────────────────

export function ProjectSwitcher({
  projects,
  activeId,
  setActiveId,
  onNew,
}: {
  projects: ProjectDef[];
  activeId: string;
  setActiveId: (id: string) => void;
  onNew: () => void;
}) {
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              background: "var(--surface-card)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            aria-label={`Active project: ${active?.name ?? ""}`}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: active?.color ?? "var(--primary)",
                flexShrink: 0,
              }}
            />
            <span
              style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4 }}
            >
              {active?.name ?? ""}
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: "var(--muted-foreground)",
                padding: "1px 5px",
                borderRadius: 4,
                background: "var(--surface-strong)",
                border: "1px solid var(--hairline)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {active?.cards.length ?? 0}
            </span>
            <ChevronDownIcon size={13} aria-hidden />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6}>
        <div style={{ minWidth: 280 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              padding: "0 4px 6px",
            }}
          >
            ACTIVE
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: active?.color ?? "var(--primary)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--foreground)",
                }}
              >
                {active?.name ?? ""}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                {active?.cards.length ?? 0} cards ·{" "}
                {active?.columns.length ?? 0} columns
              </div>
            </div>
          </div>

          {projects.filter((p) => p.id !== activeId).length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--muted-foreground)",
                  letterSpacing: "0.06em",
                  padding: "12px 4px 6px",
                }}
              >
                ALL PROJECTS
              </div>
              {projects
                .filter((p) => p.id !== activeId)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    className="hover:bg-accent"
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: p.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: "var(--foreground)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-foreground)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {p.cards.length}
                    </span>
                  </button>
                ))}
            </>
          )}

          <div
            style={{
              borderTop: "1px solid var(--border)",
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              onClick={onNew}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--primary)",
                fontSize: 13,
                fontWeight: 500,
              }}
              className="hover:bg-accent"
            >
              <PlusIcon size={13} aria-hidden />
              New blank project…
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── KanbanColumn ──────────────────────────────────────────────────────────────

export function KanbanColumn({
  col,
  project,
  cards,
  onMove,
  onAdd,
  onOpen,
}: {
  col: KanbanColumnDef;
  project: ProjectDef;
  cards: ProjectCard[];
  onMove: (cardId: string, toCol: string) => void;
  onAdd: () => void;
  onOpen: (card: ProjectCard) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isActive = col.id === project.activeCol;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const id = e.dataTransfer.getData("text/card-id");
        if (id) onMove(id, col.id);
      }}
      style={{
        width: 282,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: dragOver
          ? "var(--primary-disabled, #e8f5ee)"
          : "var(--surface-soft)",
        borderRadius: 12,
        padding: 10,
        border: dragOver
          ? "1.5px dashed var(--primary)"
          : "1px solid transparent",
        transition: "background .12s",
      }}
      aria-label={`${col.name} column, ${cards.length} cards`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px 10px",
        }}
      >
        {isActive && (
          <span
            title="Active column — surfaces on Today"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--primary)",
              flexShrink: 0,
            }}
            aria-hidden
          />
        )}
        <span
          style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}
        >
          {col.name}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {cards.length}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onAdd}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 16,
            padding: 2,
            lineHeight: 1,
            borderRadius: 4,
          }}
          aria-label={`Add card to ${col.name}`}
        >
          +
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          overflowY: "auto",
          flex: 1,
          minHeight: 100,
        }}
      >
        {cards.map((c) => (
          <KanbanCard key={c.id} card={c} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <div
            style={{
              padding: "16px 8px",
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: 11,
              opacity: 0.6,
            }}
          >
            Empty · drop cards here
          </div>
        )}
      </div>
    </section>
  );
}

// ── KanbanCard ────────────────────────────────────────────────────────────────

export function KanbanCard({
  card,
  onOpen,
}: {
  card: ProjectCard;
  onOpen: (card: ProjectCard) => void;
}) {
  const ps = priorityStyle(card.priority);

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/card-id", card.id)}
      onClick={() => onOpen(card)}
      aria-label={card.title}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--card)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        boxShadow: "0 1px 1px rgba(0,0,0,.02)",
      }}
    >
      {/* chip row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        {card.linked && (
          <span
            title={`Linked from ${card.linked.repo}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <SourceGlyph source={card.linked.source} size={12} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--muted-foreground)",
              }}
            >
              {card.linked.id}
            </span>
          </span>
        )}
        <span
          style={{
            fontSize: 9,
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 600,
            background: ps.bg,
            color: ps.color,
          }}
        >
          {card.priority}
        </span>
        {card.due === "today" && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
              background: "var(--primary-disabled, #e8f5ee)",
              color: "var(--primary)",
            }}
          >
            DUE TODAY
          </span>
        )}
        {card.due === "tomorrow" && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
              background: "var(--surface-strong)",
              color: "var(--muted-foreground)",
            }}
          >
            TOMORROW
          </span>
        )}
      </div>

      {/* title */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          color: "var(--foreground)",
          marginBottom:
            card.labels.length > 0 || card.linkedSignals.length > 0 ? 8 : 0,
        }}
      >
        {card.title}
      </div>

      {/* labels + linked signal count */}
      {(card.labels.length > 0 || card.linkedSignals.length > 0) && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {card.labels.map((l) => (
            <span
              key={l}
              style={{
                fontSize: 9,
                fontWeight: 500,
                color: "var(--muted-foreground)",
                background: "var(--muted)",
                padding: "1px 6px",
                borderRadius: 4,
                opacity: 0.7,
              }}
            >
              {l}
            </span>
          ))}
          {card.linkedSignals.length > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--muted-foreground)",
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={`${card.linkedSignals.length} linked signal(s)`}
            >
              <LinkIcon size={11} aria-hidden />
              {card.linkedSignals.length}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ── ColumnEditor (shared by NewProjectDialog and EditColumnsDialog) ────────────

function ColumnEditor({
  columns,
  activeCol,
  onChange,
  onActiveColChange,
  showActiveCol = true,
}: {
  columns: KanbanColumnDef[];
  activeCol: string;
  onChange: (cols: KanbanColumnDef[]) => void;
  onActiveColChange: (id: string) => void;
  showActiveCol?: boolean;
}) {
  const updateCol = (i: number, val: string) =>
    onChange(
      columns.map((c, idx) => (idx === i ? { ...c, name: val } : c)),
    );

  const removeCol = (i: number) =>
    onChange(columns.length > 1 ? columns.filter((_, idx) => idx !== i) : columns);

  const addCol = () =>
    onChange([...columns, { id: crypto.randomUUID(), name: "New column" }]);

  const moveCol = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const next = [...columns];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {columns.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 6,
              background: "var(--muted)",
              borderRadius: 8,
              opacity: 0.9,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--muted-foreground)",
                width: 18,
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {i + 1}
            </span>
            <input
              value={c.name}
              onChange={(e) => updateCol(i, e.target.value)}
              aria-label={`Column ${i + 1} name`}
              style={{
                flex: 1,
                padding: "5px 9px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 13,
                outline: "none",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            {showActiveCol && (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color:
                    activeCol === c.id
                      ? "var(--primary)"
                      : "var(--muted-foreground)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="radio"
                  checked={activeCol === c.id}
                  onChange={() => onActiveColChange(c.id)}
                  aria-label={`Set ${c.name} as active column`}
                />
                Active
              </label>
            )}
            <button
              type="button"
              onClick={() => moveCol(i, -1)}
              disabled={i === 0}
              aria-label="Move column up"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted-foreground)",
                cursor: i === 0 ? "default" : "pointer",
                padding: 4,
                opacity: i === 0 ? 0.3 : 1,
              }}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => moveCol(i, 1)}
              disabled={i === columns.length - 1}
              aria-label="Move column down"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted-foreground)",
                cursor: i === columns.length - 1 ? "default" : "pointer",
                padding: 4,
                opacity: i === columns.length - 1 ? 0.3 : 1,
              }}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => removeCol(i)}
              aria-label={`Remove column ${c.name}`}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--muted-foreground)",
                cursor: "pointer",
                fontSize: 16,
                padding: 4,
                lineHeight: 1,
              }}
            >
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addCol}
        aria-label="Add column to list"
        style={{
          marginTop: 8,
          border: "1px dashed var(--border)",
          background: "transparent",
          padding: "5px 12px",
          borderRadius: 6,
          color: "var(--muted-foreground)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        + Add column
      </button>
      <p
        style={{
          fontSize: 10,
          color: "var(--muted-foreground)",
          marginTop: 6,
        }}
      >
        Active column = the one that surfaces on the Today page's "In progress"
        widget.
      </p>
    </div>
  );
}

// ── NewProjectDialog ──────────────────────────────────────────────────────────

export function NewProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: ProjectDef) => void;
}) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<KanbanColumnDef[]>([
    { id: crypto.randomUUID(), name: "To do" },
    { id: crypto.randomUUID(), name: "Doing" },
    { id: crypto.randomUUID(), name: "Done" },
  ]);
  const [activeCol, setActiveCol] = useState(columns[1]?.id ?? "");

  const handleCreate = () => {
    if (!name.trim() || columns.length === 0) return;
    onCreate({
      id: crypto.randomUUID(),
      name: name.trim(),
      color: "#0a8754",
      activeCol,
      columns,
      cards: [],
    });
  };

  return (
    <DialogContent className="sm:max-w-lg" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <p
          style={{
            fontSize: 13,
            color: "var(--muted-foreground)",
            marginTop: 2,
          }}
        >
          Define your columns now — they're hard to reorganize later.
        </p>
      </DialogHeader>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
            htmlFor="project-name"
          >
            NAME
          </label>
          <Input
            id="project-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Platform Q2"
          />
        </div>

        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            COLUMNS · IN ORDER
          </div>
          <ColumnEditor
            columns={columns}
            activeCol={activeCol}
            onChange={setColumns}
            onActiveColChange={setActiveCol}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 4,
        }}
      >
        <Button variant="ghost" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="default"
          onClick={handleCreate}
          disabled={!name.trim()}
          type="button"
        >
          Create project
        </Button>
      </div>
    </DialogContent>
  );
}

// ── EditColumnsDialog ─────────────────────────────────────────────────────────

export function EditColumnsDialog({
  project,
  onClose,
  onSave,
}: {
  project: ProjectDef;
  onClose: () => void;
  onSave: (cols: KanbanColumnDef[]) => void;
}) {
  const [columns, setColumns] = useState<KanbanColumnDef[]>(project.columns);
  const [activeCol, setActiveCol] = useState(project.activeCol);

  return (
    <DialogContent className="sm:max-w-lg" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Edit columns — {project.name}</DialogTitle>
      </DialogHeader>

      <ColumnEditor
        columns={columns}
        activeCol={activeCol}
        onChange={setColumns}
        onActiveColChange={setActiveCol}
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        <Button variant="ghost" onClick={onClose} type="button">
          Cancel
        </Button>
        <Button
          variant="default"
          onClick={() => onSave(columns)}
          disabled={columns.length === 0}
          type="button"
        >
          Save columns
        </Button>
      </div>
    </DialogContent>
  );
}

// ── CardDetailDialog ──────────────────────────────────────────────────────────

export function CardDetailDialog({
  card,
  project,
  allSignals = [],
  onUpdate,
  onLinkSignal,
  onUnlinkSignal,
}: {
  card: ProjectCard;
  project: ProjectDef;
  allSignals?: FixtureSignal[];
  onUpdate: (patch: Partial<ProjectCard>) => void;
  onLinkSignal: () => void;
  onUnlinkSignal?: (sigId: string) => void;
}) {
  const sigsById = useMemo(
    () => Object.fromEntries(allSignals.map((s) => [s.id, s])),
    [allSignals],
  );
  const ps = priorityStyle(card.priority);
  const colName = project.columns.find((c) => c.id === card.col)?.name ?? "";

  return (
    <DialogContent className="sm:max-w-[640px]" showCloseButton>
      {/* header chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {card.linked && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              background: "var(--muted)",
              borderRadius: 6,
            }}
          >
            <SourceGlyph source={card.linked.source} size={14} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--foreground)",
              }}
            >
              {card.linked.id}
            </span>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
              linked
            </span>
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
            fontWeight: 600,
            background: ps.bg,
            color: ps.color,
          }}
        >
          {card.priority}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          {project.name} · {colName}
        </span>
      </div>

      {/* title */}
      <input
        value={card.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        aria-label="Card title"
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          fontSize: 20,
          fontWeight: 600,
          color: "var(--foreground)",
          padding: "4px 0",
          marginBottom: 14,
          background: "transparent",
        }}
      />

      {/* metadata grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "100px 1fr",
          gap: "10px 14px",
          marginBottom: 18,
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--muted-foreground)", alignSelf: "center" }}>
          Priority
        </span>
        <select
          value={card.priority}
          onChange={(e) =>
            onUpdate({ priority: e.target.value as CardPriority })
          }
          aria-label="Priority"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            background: "var(--background)",
            color: "var(--foreground)",
            width: 80,
          }}
        >
          <option>P1</option>
          <option>P2</option>
          <option>P3</option>
        </select>

        <span style={{ color: "var(--muted-foreground)", alignSelf: "center" }}>
          Due
        </span>
        <select
          value={card.due ?? ""}
          onChange={(e) =>
            onUpdate({ due: (e.target.value || null) as CardDue })
          }
          aria-label="Due date"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            background: "var(--background)",
            color: "var(--foreground)",
            width: 140,
          }}
        >
          <option value="">No due date</option>
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="this-week">This week</option>
        </select>

        <span
          style={{
            color: "var(--muted-foreground)",
            alignSelf: "start",
            paddingTop: 4,
          }}
        >
          Labels
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {card.labels.map((l) => (
            <span
              key={l}
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "var(--muted-foreground)",
                background: "var(--muted)",
                padding: "2px 7px",
                borderRadius: 4,
                opacity: 0.8,
              }}
            >
              {l}
            </span>
          ))}
          <button
            type="button"
            style={{
              border: "1px dashed var(--border)",
              background: "transparent",
              padding: "1px 7px",
              borderRadius: 4,
              color: "var(--muted-foreground)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* description */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--muted-foreground)",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        DESCRIPTION
      </div>
      <div style={{ marginBottom: 18 }}>
        <Textarea
          value={card.desc}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUpdate({ desc: e.target.value })
          }
          placeholder="Notes, context, links…"
          aria-label="Description"
        />
      </div>

      {/* linked signals */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
          }}
        >
          LINKED SIGNALS
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            marginLeft: 6,
          }}
        >
          {card.linkedSignals.length}
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={onLinkSignal} type="button">
          <LinkIcon size={13} aria-hidden />
          Link signal
        </Button>
      </div>

      {card.linkedSignals.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          {card.linkedSignals.map((sid, i, arr) => {
            const s = sigsById[sid];
            if (!s) return null;
            return (
              <div
                key={sid}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom:
                    i < arr.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <SourceGlyph source={s.source} size={16} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted-foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.repo ? `${s.repo} ${s.num}` : (s.sub ?? "")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onUpdate({
                      linkedSignals: card.linkedSignals.filter(
                        (x) => x !== sid,
                      ),
                    });
                    onUnlinkSignal?.(sid);
                  }}
                  aria-label={`Unlink ${s.title}`}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                    padding: 4,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <XIcon size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            padding: "10px 12px",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--muted-foreground)",
            textAlign: "center",
            marginBottom: 18,
          }}
        >
          No signals linked. PRs, mentions, and tickets you connect here will
          keep this card in context.
        </div>
      )}

      {/* external source */}
      {card.linked && (
        <>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted-foreground)",
              letterSpacing: "0.06em",
              marginBottom: 6,
            }}
          >
            EXTERNAL SOURCE
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--muted)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--foreground)",
              opacity: 0.9,
            }}
          >
            <SourceGlyph source={card.linked.source} size={16} />
            <span style={{ flex: 1 }}>
              This card mirrors <strong>{card.linked.id}</strong> in{" "}
              {card.linked.repo}. Edits sync back via API.
            </span>
            <Button variant="outline" size="sm" type="button">
              Open in {card.linked.repo}
            </Button>
          </div>
        </>
      )}
    </DialogContent>
  );
}

// ── SignalLinkPickerDialog ─────────────────────────────────────────────────────

export function SignalLinkPickerDialog({
  signals = [],
  alreadyLinked,
  onPick,
}: {
  signals?: FixtureSignal[];
  alreadyLinked: string[];
  onPick: (sigId: string) => void;
}) {
  const [q, setQ] = useState("");

  const items = signals.filter(
    (s) =>
      !alreadyLinked.includes(s.id) &&
      (!q || s.title.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <DialogContent className="sm:max-w-[540px]" showCloseButton>
      <DialogHeader>
        <DialogTitle>Link a signal</DialogTitle>
      </DialogHeader>
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search PRs, mentions, tickets…"
        aria-label="Search signals"
      />
      <div
        style={{
          overflowY: "auto",
          maxHeight: 320,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginTop: 4,
        }}
        aria-label="signal list"
      >
        {items.map((s, i, arr) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="hover:bg-accent"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 12px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              borderBottom:
                i < arr.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <SourceGlyph source={s.source} size={18} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.title}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.repo ? `${s.repo} ${s.num}` : (s.sub ?? "")}
              </div>
            </div>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
              link →
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--muted-foreground)",
              fontSize: 12,
            }}
          >
            No matching signals.
          </div>
        )}
      </div>
    </DialogContent>
  );
}
