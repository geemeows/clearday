// Card detail pane: editable surface for a single card. Renders as a fixed
// right-side panel with a backdrop overlay. Each field change calls
// onChange synchronously; the parent owns persistence (debounced via the
// store). Title saves on blur to avoid spamming writes per keystroke.

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardPatch, StoredCard, StoredColumn } from "#/features/projects/store";

export type CardDetailPaneProps = {
  card: StoredCard;
  columns: StoredColumn[];
  onChange: (patch: CardPatch) => void;
  onDelete: () => void;
  onClose: () => void;
};

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
  }, [card.id, card.title, card.body]);

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

  const commitBody = useCallback(() => {
    const next = body.length === 0 ? null : body;
    if (next !== (card.body ?? null)) onChange({ body: next });
  }, [body, card.body, onChange]);

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
            className="flex-1 bg-transparent font-semibold text-foreground text-lg outline-none placeholder:text-muted-foreground"
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
            <textarea
              aria-label="Card body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onBlur={commitBody}
              rows={5}
              placeholder="Add details…"
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}
