// ProjectsPage — Redesign v5 / Projects (#181)
// Kanban board: board view, project switcher, card detail pane, signal linking.

import { useMemo, useState } from "react";
import { ChevronDownIcon, LinkIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "#/components/ui/popover";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";

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

// ── Fixture data ──────────────────────────────────────────────────────────────

const FIXTURE_SIGNALS: FixtureSignal[] = [
  { id: "s1", source: "git", title: "Add retry logic to Slack adapter", repo: "platform", num: "PR #214" },
  { id: "s2", source: "git", title: "Fix auth-proxy token TTL edge case", repo: "platform", num: "PR #218" },
  { id: "s3", source: "slack", title: "@here standup reminder", sub: "#eng-platform" },
  { id: "s4", source: "slack", title: "Review cron idempotency PR", sub: "DM from Joon" },
  { id: "s5", source: "cal", title: "Sprint planning", sub: "Today 2:00 PM" },
  { id: "s6", source: "git", title: "ci: bump actions/checkout to v4", repo: "platform", num: "PR #215" },
  { id: "s7", source: "task", title: "DEV-441: Slack adapter retry budget", sub: "In review" },
  { id: "s8", source: "task", title: "DEV-447: Cron idempotent retry tick", sub: "Review" },
];

const INITIAL_PROJECTS: ProjectDef[] = [
  {
    id: "p-platform",
    name: "Platform Q2",
    color: "var(--primary)",
    activeCol: "doing",
    columns: [
      { id: "backlog", name: "Backlog" },
      { id: "doing", name: "In progress" },
      { id: "review", name: "In review" },
      { id: "shipped", name: "Shipped" },
    ],
    cards: [
      { id: "c1", col: "doing", title: "Slack adapter retry budget", desc: "Cap retries at 3 with jitter; emit metric on bail.", priority: "P1", labels: ["infra"], due: "today", linked: { source: "task", id: "DEV-441", repo: "linear" }, linkedSignals: ["s2", "s6"] },
      { id: "c2", col: "doing", title: "Auth-proxy state token TTL audit", desc: "", priority: "P1", labels: ["security"], due: "tomorrow", linked: null, linkedSignals: ["s7"] },
      { id: "c3", col: "review", title: "Cron orchestrator: idempotent retry tick", desc: "PR up — awaiting CI.", priority: "P2", labels: ["infra"], due: null, linked: { source: "task", id: "DEV-447", repo: "linear" }, linkedSignals: [] },
      { id: "c4", col: "backlog", title: "Signal-store upsert benchmarks", desc: "", priority: "P3", labels: ["perf"], due: null, linked: { source: "task", id: "DEV-401", repo: "linear" }, linkedSignals: [] },
      { id: "c5", col: "backlog", title: "Web-push VAPID key rotation flow", desc: "Document rotation cadence.", priority: "P3", labels: ["alerts"], due: null, linked: null, linkedSignals: [] },
      { id: "c6", col: "shipped", title: "Onboarding: Slack-channel allowlist step", desc: "", priority: "P2", labels: ["onboarding"], due: null, linked: { source: "task", id: "DEV-388", repo: "linear" }, linkedSignals: [] },
    ],
  },
  {
    id: "p-personal",
    name: "Personal",
    color: "#7c3aed",
    activeCol: "doing",
    columns: [
      { id: "ideas", name: "Ideas" },
      { id: "doing", name: "Doing" },
      { id: "done", name: "Done" },
    ],
    cards: [
      { id: "c7", col: "doing", title: "Read 'A Philosophy of Software Design'", desc: "Ch 4–6 this week.", priority: "P3", labels: ["reading"], due: null, linked: null, linkedSignals: [] },
      { id: "c8", col: "ideas", title: "Refactor home dotfiles", desc: "", priority: "P3", labels: [], due: null, linked: null, linkedSignals: [] },
    ],
  },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function priorityStyle(p: CardPriority): { bg: string; color: string } {
  if (p === "P1") return { bg: "var(--danger-soft)", color: "var(--danger)" };
  if (p === "P2") return { bg: "var(--warn-soft)", color: "var(--warn)" };
  return { bg: "var(--surface-strong)", color: "var(--muted)" };
}

// ── ProjectsPage ──────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDef[]>(INITIAL_PROJECTS);
  const [activeId, setActiveId] = useState("p-platform");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [linkPickerCardId, setLinkPickerCardId] = useState<string | null>(null);

  const project = projects.find((p) => p.id === activeId)!;

  const updateProject = (id: string, fn: (p: ProjectDef) => ProjectDef) =>
    setProjects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  const moveCard = (cardId: string, toCol: string) =>
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) => (c.id === cardId ? { ...c, col: toCol } : c)),
    }));

  const addCard = (colId: string) =>
    updateProject(activeId, (p) => ({
      ...p,
      cards: [
        ...p.cards,
        {
          id: `c${Date.now()}`,
          col: colId,
          title: "Untitled",
          desc: "",
          priority: "P3" as CardPriority,
          labels: [],
          due: null,
          linked: null,
          linkedSignals: [],
        },
      ],
    }));

  const updateCard = (cardId: string, patch: Partial<ProjectCard>) =>
    updateProject(activeId, (p) => ({
      ...p,
      cards: p.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    }));

  const linkSignal = (cardId: string, sigId: string) =>
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

  const openCard = project.cards.find((c) => c.id === openCardId) ?? null;

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
        <span style={{ flex: 1 }} />
        <span
          style={{ fontSize: 12, color: "var(--muted-foreground)" }}
          aria-label="project stats"
        >
          {project.cards.length} cards · {project.columns.length} columns
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
            minWidth: project.columns.length * 294,
          }}
        >
          {project.columns.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              project={project}
              cards={project.cards.filter((c) => c.col === col.id)}
              onMove={moveCard}
              onAdd={() => addCard(col.id)}
              onOpen={(c) => setOpenCardId(c.id)}
            />
          ))}
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
          }}
        />
      </Dialog>

      {/* Card detail dialog */}
      <Dialog
        open={openCardId !== null}
        onOpenChange={(open) => { if (!open) setOpenCardId(null); }}
      >
        {openCard && (
          <CardDetailDialog
            card={openCard}
            project={project}
            onUpdate={(patch) => updateCard(openCard.id, patch)}
            onLinkSignal={() => {
              setLinkPickerCardId(openCard.id);
              setOpenCardId(null);
            }}
          />
        )}
      </Dialog>

      {/* Signal link picker dialog */}
      <Dialog
        open={linkPickerCardId !== null}
        onOpenChange={(open) => { if (!open) setLinkPickerCardId(null); }}
      >
        {linkPickerCardId && (
          <SignalLinkPickerDialog
            alreadyLinked={
              project.cards.find((c) => c.id === linkPickerCardId)
                ?.linkedSignals ?? []
            }
            onPick={(sigId) => {
              linkSignal(linkPickerCardId, sigId);
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
  const active = projects.find((p) => p.id === activeId)!;

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
            aria-label={`Active project: ${active.name}`}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: active.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4 }}>
              {active.name}
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
              {active.cards.length}
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
              style={{ width: 8, height: 8, borderRadius: 999, background: active.color, flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                {active.name}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                {active.cards.length} cards · {active.columns.length} columns
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
    <div
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
        background: dragOver ? "var(--primary-disabled, #e8f5ee)" : "var(--surface-soft)",
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
          style={{ fontSize: 11, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}
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
    </div>
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
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/card-id", card.id)}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(card); }}
      aria-label={card.title}
      style={{
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
        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}
      >
        {card.linked && (
          <span
            title={`Linked from ${card.linked.repo}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <SourceGlyph source={card.linked.source} size={12} />
            <span
              style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)" }}
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
          marginBottom: card.labels.length > 0 || card.linkedSignals.length > 0 ? 8 : 0,
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
    { id: "todo", name: "To do" },
    { id: "doing", name: "Doing" },
    { id: "done", name: "Done" },
  ]);
  const [activeCol, setActiveCol] = useState("doing");

  const updateCol = (i: number, val: string) =>
    setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, name: val } : c)));

  const removeCol = (i: number) =>
    setColumns((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  const addCol = () =>
    setColumns((cs) => [...cs, { id: `col${Date.now()}`, name: "New column" }]);

  const moveCol = (i: number, dir: -1 | 1) =>
    setColumns((cs) => {
      const j = i + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const handleCreate = () => {
    if (!name.trim() || columns.length === 0) return;
    onCreate({
      id: `p-${Date.now()}`,
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
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
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
                    onChange={() => setActiveCol(c.id)}
                    aria-label={`Set ${c.name} as active column`}
                  />
                  Active
                </label>
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
            Active column = the one that surfaces on the Today page's "In progress" widget.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
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

// ── CardDetailDialog ──────────────────────────────────────────────────────────

export function CardDetailDialog({
  card,
  project,
  onUpdate,
  onLinkSignal,
}: {
  card: ProjectCard;
  project: ProjectDef;
  onUpdate: (patch: Partial<ProjectCard>) => void;
  onLinkSignal: () => void;
}) {
  const sigsById = useMemo(
    () => Object.fromEntries(FIXTURE_SIGNALS.map((s) => [s.id, s])),
    [],
  );
  const ps = priorityStyle(card.priority);
  const colName = project.columns.find((c) => c.id === card.col)?.name ?? "";

  return (
    <DialogContent className="sm:max-w-[640px]" showCloseButton>
      {/* header chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
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
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)" }}>
              {card.linked.id}
            </span>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>linked</span>
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
        <span style={{ color: "var(--muted-foreground)", alignSelf: "center" }}>Priority</span>
        <select
          value={card.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as CardPriority })}
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

        <span style={{ color: "var(--muted-foreground)", alignSelf: "center" }}>Due</span>
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

        <span style={{ color: "var(--muted-foreground)", alignSelf: "start", paddingTop: 4 }}>Labels</span>
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
          style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 6 }}
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
                    {s.repo ? `${s.repo} ${s.num}` : s.sub ?? ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      linkedSignals: card.linkedSignals.filter((x) => x !== sid),
                    })
                  }
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
              This card mirrors{" "}
              <strong>{card.linked.id}</strong> in {card.linked.repo}. Edits
              sync back via API.
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
  alreadyLinked,
  onPick,
}: {
  alreadyLinked: string[];
  onPick: (sigId: string) => void;
}) {
  const [q, setQ] = useState("");

  const items = FIXTURE_SIGNALS.filter(
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
