// Card detail pane: editable surface for a single card. Renders as a centered
// modal over a backdrop overlay, per the projects.jsx mockup. Each field
// change calls onChange synchronously; the parent owns persistence (debounced
// via the store). Title saves on blur to avoid spamming writes per keystroke.

import { MoreHorizontal, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RichEditor } from "#/components/rich-editor";
import { SourceGlyph } from "#/features/signals/components/SourceGlyph";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "#/components/ui/popover";
import type {
  CardPatch,
  StoredCard,
  StoredCardTicket,
  StoredColumn,
} from "#/features/projects/store";

export type CardDetailPaneProps = {
  card: StoredCard;
  columns: StoredColumn[];
  projectName?: string;
  onChange: (patch: CardPatch) => void;
  onDelete: () => void;
  onClose: () => void;
  tickets?: StoredCardTicket[];
  onLinkGithub?: (input: string) => Promise<{ error?: string } | undefined>;
  onUnlinkTicket?: (ticketId: string) => void;
  onRefreshTicket?: (ticketId: string) => void;
};

// TipTap returns "<p></p>" for an empty document. Treat that as null so
// existing card.body === null contract is preserved.
function isEmptyHtml(html: string): boolean {
  const stripped = html.replace(/<p>(\s|&nbsp;|<br\/?>)*<\/p>/g, "").trim();
  return stripped.length === 0;
}

const PRIORITIES: Array<{ value: string; label: string }> = [
  { value: "", label: "—" },
  { value: "p0", label: "P0" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
];

function priorityChipStyle(priority: string | null): React.CSSProperties {
  const p = (priority ?? "").toLowerCase();
  if (p === "p0" || p === "p1") {
    return { background: "var(--danger-soft)", color: "var(--danger)" };
  }
  if (p === "p2") {
    return { background: "var(--warn-soft)", color: "var(--warn)" };
  }
  return {
    background: "var(--surface-strong)",
    color: "var(--muted-foreground)",
  };
}

export function CardDetailPane({
  card,
  columns,
  projectName,
  onChange,
  onDelete,
  onClose,
  tickets,
  onLinkGithub,
  onUnlinkTicket,
  onRefreshTicket,
}: CardDetailPaneProps) {
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Sync local state when card prop changes (different card opened).
  useEffect(() => {
    setTitle(card.title);
    setBody(card.body ?? "");
    setTagDraft("");
    setConfirmingDelete(false);
  }, [card.title, card.body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitTitle = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      return;
    }
    if (trimmed !== card.title) onChange({ title: trimmed });
  }, [title, card.title, onChange]);

  const commitBody = useCallback(
    (html: string) => {
      const next = isEmptyHtml(html) ? null : html;
      if (next !== (card.body ?? null)) onChange({ body: next });
    },
    [card.body, onChange],
  );

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    onChange({ priority: next === "" ? null : next });
  };

  const handleDueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) {
      onChange({ due_at: null });
      return;
    }
    const iso = new Date(`${v}T00:00:00`).toISOString();
    onChange({ due_at: iso });
  };

  const dueValue = card.due_at ? card.due_at.slice(0, 10) : "";

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (card.tags.includes(t)) {
      setTagDraft("");
      return;
    }
    onChange({ tags: [...card.tags, t] });
    setTagDraft("");
  };

  const removeTag = (t: string) => {
    onChange({ tags: card.tags.filter((x) => x !== t) });
  };

  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  useEffect(() => {
    setLinkDraft("");
    setLinkError(null);
  }, []);

  const submitLink = async () => {
    const v = linkDraft.trim();
    if (!v || !onLinkGithub) return;
    setLinkSubmitting(true);
    const out = await onLinkGithub(v);
    setLinkSubmitting(false);
    if (out?.error) {
      setLinkError(out.error);
      return;
    }
    setLinkError(null);
    setLinkDraft("");
  };

  const columnName = columns.find((c) => c.id === card.column_id)?.name ?? "";
  const breadcrumb = projectName
    ? `${projectName} · ${columnName}`
    : columnName;
  const linkedTickets = tickets ?? [];
  const linkedCount = linkedTickets.length;

  return (
    <div
      role="dialog"
      aria-label="Card details"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-start justify-center px-5 pt-[8vh]"
    >
      <button
        type="button"
        aria-label="Close card details"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className="relative flex max-h-[80vh] w-[640px] max-w-[calc(100vw-2.5rem)] flex-col overflow-y-auto rounded-[14px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
        style={{ background: "var(--canvas)" }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center gap-2">
          {linkedTickets[0] && (
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-[3px]"
              style={{ background: "var(--surface-strong)" }}
            >
              <SourceGlyph
                source={
                  linkedTickets[0].source === "github"
                    ? "git"
                    : linkedTickets[0].source
                }
                size={14}
              />
              <span
                className="font-mono font-semibold text-[11px]"
                style={{ color: "var(--ink, var(--foreground))" }}
              >
                {linkedTickets[0].ext_id}
              </span>
              <span
                className="font-mono text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                linked
              </span>
            </span>
          )}
          {card.priority && (
            <span
              className="inline-flex items-center rounded-md px-2 py-[2px] font-medium text-[10px] leading-[1.4]"
              style={priorityChipStyle(card.priority)}
            >
              {card.priority.toUpperCase()}
            </span>
          )}
          <span className="flex-1" />
          {breadcrumb && (
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {breadcrumb}
            </span>
          )}
          <Popover>
            <PopoverTrigger
              aria-label="More actions"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverPopup
              align="end"
              className="w-44 p-1"
            >
              {confirmingDelete ? (
                <div className="flex flex-col gap-1">
                  <p className="px-2 py-1 text-muted-foreground text-xs">
                    Delete this card?
                  </p>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded px-2 py-1 text-muted-foreground text-xs hover:bg-accent"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      aria-label="Confirm delete"
                      onClick={() => {
                        setConfirmingDelete(false);
                        onDelete();
                      }}
                      className="rounded bg-destructive px-2 py-1 text-destructive-foreground text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex w-full items-center rounded px-2 py-1 text-destructive text-xs hover:bg-destructive/10"
                >
                  Delete card
                </button>
              )}
            </PopoverPopup>
          </Popover>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <input
          ref={titleRef}
          aria-label="Card title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="mb-3.5 w-full bg-transparent py-1 font-semibold text-[22px] text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Card title"
        />

        <div
          className="mb-[18px] grid items-center text-[13px]"
          style={{
            gridTemplateColumns: "100px 1fr",
            columnGap: "14px",
            rowGap: "10px",
          }}
        >
          <span className="text-muted-foreground">Priority</span>
          <select
            aria-label="Priority"
            value={card.priority ?? ""}
            onChange={handlePriorityChange}
            className="w-20 rounded-md border px-2 py-1 text-[12px] outline-none"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--canvas)",
              color: "var(--foreground)",
            }}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">Due</span>
          <input
            type="date"
            aria-label="Due date"
            value={dueValue}
            onChange={handleDueChange}
            className="w-[160px] rounded-md border px-2 py-1 text-[12px] outline-none focus:border-primary"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--canvas)",
              color: "var(--foreground)",
            }}
          />
          <span className="text-muted-foreground">Labels</span>
          <div className="flex flex-wrap items-center gap-1">
            {card.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-[4px] px-[7px] py-[2px] font-mono font-medium text-[10px]"
                style={{
                  background: "var(--surface-soft)",
                  color: "var(--muted-foreground)",
                }}
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => removeTag(t)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              aria-label="Add tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="Add label…"
              className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-foreground text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <p className="mb-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.4px]">
          Description
        </p>
        <div className="mb-[18px]">
          <RichEditor
            ariaLabel="Card body"
            value={body}
            onChange={setBody}
            onBlur={commitBody}
            placeholder="Notes, context, links…"
            minHeight={92}
          />
        </div>

        {onLinkGithub && (
          <>
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.4px]">
                Linked signals
              </span>
              <span
                className="font-mono text-[11px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {linkedCount}
              </span>
            </div>
            {linkedCount > 0 ? (
              <div
                className="mb-3 flex flex-col overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--hairline-soft)" }}
              >
                {linkedTickets.map((t, i) => (
                  <TicketChip
                    key={t.id}
                    ticket={t}
                    onRefresh={onRefreshTicket}
                    onUnlink={onUnlinkTicket}
                    isLast={i === linkedTickets.length - 1}
                  />
                ))}
              </div>
            ) : (
              <div
                className="mb-3 rounded-lg border border-dashed px-3 py-2.5 text-center text-[12px]"
                style={{
                  borderColor: "var(--hairline)",
                  color: "var(--muted-soft, var(--muted-foreground))",
                }}
              >
                No signals linked. PRs, mentions, and tickets you connect here
                will keep this card in context.
              </div>
            )}
            <div className="mb-1 flex gap-1.5">
              <input
                aria-label="Link GitHub"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitLink();
                  }
                }}
                placeholder="GitHub URL or owner/repo#N"
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={submitLink}
                disabled={linkSubmitting || !linkDraft.trim()}
                className="rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground text-xs disabled:opacity-50"
              >
                Link
              </button>
            </div>
            {linkError && (
              <p role="alert" className="text-destructive text-xs">
                {linkError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TicketChip({
  ticket,
  onRefresh,
  onUnlink,
  isLast,
}: {
  ticket: StoredCardTicket;
  onRefresh?: (id: string) => void;
  onUnlink?: (id: string) => void;
  isLast?: boolean;
}) {
  const isDegraded = ticket.last_seen_at == null;
  const statusLabel =
    ticket.status ?? (isDegraded ? "reconnect to refresh" : "");
  return (
    <div
      data-testid={`ticket-chip-${ticket.id}`}
      className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 text-xs"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--hairline-soft)",
      }}
    >
      <a
        href={isDegraded ? "/settings/integrations" : ticket.url}
        target={isDegraded ? "_self" : "_blank"}
        rel="noreferrer"
        className="font-medium text-foreground hover:underline"
      >
        {ticket.source} · {ticket.ext_id}
      </a>
      {statusLabel && (
        <span className="text-muted-foreground">· {statusLabel}</span>
      )}
      {ticket.assignee && (
        <span className="text-muted-foreground">· @{ticket.assignee}</span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {onRefresh && (
          <button
            type="button"
            aria-label={`Refresh ${ticket.ext_id}`}
            onClick={() => onRefresh(ticket.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
        {onUnlink && (
          <button
            type="button"
            aria-label={`Unlink ${ticket.ext_id}`}
            onClick={() => onUnlink(ticket.id)}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
