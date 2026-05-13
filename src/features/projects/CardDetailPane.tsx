// Card detail pane: editable surface for a single card. Renders as a fixed
// right-side panel with a backdrop overlay. Each field change calls
// onChange synchronously; the parent owns persistence (debounced via the
// store). Title saves on blur to avoid spamming writes per keystroke.

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RichEditor } from "#/components/rich-editor";
import type {
  CardPatch,
  StoredCard,
  StoredCardTicket,
  StoredColumn,
} from "#/features/projects/store";

export type CardDetailPaneProps = {
  card: StoredCard;
  columns: StoredColumn[];
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

export function CardDetailPane({
  card,
  columns,
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

  const handleColumnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next !== card.column_id) onChange({ column_id: next });
  };

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

  return (
    <div
      role="dialog"
      aria-label="Card details"
      aria-modal="true"
      className="fixed inset-0 z-40 flex"
    >
      <button
        type="button"
        aria-label="Close card details"
        onClick={onClose}
        className="flex-1 bg-black/30"
      />
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background shadow-xl"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
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
            className="flex-1 bg-transparent font-semibold text-[22px] text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Card title"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 py-4">
          <Field label="Description">
            <RichEditor
              ariaLabel="Card body"
              value={body}
              onChange={setBody}
              onBlur={commitBody}
              placeholder="Add details…"
              minHeight={96}
            />
          </Field>

          <Field label="Column">
            <select
              aria-label="Column"
              value={card.column_id}
              onChange={handleColumnChange}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              aria-label="Priority"
              value={card.priority ?? ""}
              onChange={handlePriorityChange}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Due date">
            <input
              type="date"
              aria-label="Due date"
              value={dueValue}
              onChange={handleDueChange}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </Field>

          {onLinkGithub && (
            <Field label="Linked tickets">
              <div className="flex flex-col gap-1.5">
                {(tickets ?? []).map((t) => (
                  <TicketChip
                    key={t.id}
                    ticket={t}
                    onRefresh={onRefreshTicket}
                    onUnlink={onUnlinkTicket}
                  />
                ))}
                <div className="flex gap-1.5">
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
              </div>
            </Field>
          )}

          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {card.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-foreground text-xs"
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
                placeholder="Add tag…"
                className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-foreground text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>
        </div>

        <footer className="mt-auto flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          {confirmingDelete ? (
            <>
              <span className="mr-auto text-muted-foreground text-xs">
                Delete this card?
              </span>
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
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded px-2 py-1 text-destructive text-xs hover:bg-destructive/10"
            >
              Delete card
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function TicketChip({
  ticket,
  onRefresh,
  onUnlink,
}: {
  ticket: StoredCardTicket;
  onRefresh?: (id: string) => void;
  onUnlink?: (id: string) => void;
}) {
  const isDegraded = ticket.last_seen_at == null;
  const statusLabel =
    ticket.status ?? (isDegraded ? "reconnect to refresh" : "");
  return (
    <div
      data-testid={`ticket-chip-${ticket.id}`}
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: this Field wrapper takes the form control via {children}; biome can't see it through props.
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.4px]">
        {label}
      </span>
      {children}
    </label>
  );
}
