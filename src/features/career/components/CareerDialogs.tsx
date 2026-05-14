// All Career page modal dialogs:
//   SyncDialog, ShareDialog, EvidenceAddDialog, EvidenceListDialog,
//   HeaderFieldDialog, CompetencyAddDialog, CriterionAddDialog,
//   IndicatorAddDialog, CommentsDialog, DevPlanAddDialog, LegendEditDialog

import { useEffect, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  LayersIcon,
  Link2Icon,
  ListChecksIcon,
  ListPlusIcon,
  PaperclipIcon,
  PlusIcon,
  QuoteIcon,
  RefreshCwIcon,
  RouteIcon,
  SendIcon,
  Share2Icon,
  SlidersIcon,
  SquareCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import type {
  CareerLevel,
  Criterion,
  EvidenceKind,
  Indicator,
  ScoreLegend,
} from "./career-data";
import { CAREER_LEGEND } from "./career-data";

// ── Shared dialog icon wrapper ────────────────────────────────────────────────

function DlgIcon({
  children,
  tint = false,
}: {
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <div
      className="size-9 rounded-lg inline-flex items-center justify-center shrink-0"
      style={{
        background: tint ? "var(--accent-tint)" : "var(--good-soft)",
        color: tint ? "var(--primary)" : "var(--good)",
      }}
    >
      {children}
    </div>
  );
}

// ── SyncDialog ────────────────────────────────────────────────────────────────

type SyncMode = "resync" | "first" | "error";
type SyncPhase = "idle" | "running" | "done" | "error";

export function SyncDialog({
  open,
  onOpenChange,
  level,
  mode = "resync",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: CareerLevel;
  mode?: SyncMode;
}) {
  const [phase, setPhase] = useState<SyncPhase>("idle");

  useEffect(() => {
    if (open) setPhase(mode === "error" ? "error" : "idle");
  }, [open, mode]);

  const run = () => {
    setPhase("running");
    setTimeout(() => setPhase("done"), 1100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon>
            <span
              className="size-[22px] rounded inline-flex items-center justify-center text-[14px] font-bold"
              style={{ background: "#0F9D58", color: "white" }}
            >
              S
            </span>
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>
              {mode === "first"
                ? "Push to a new Google Sheet"
                : mode === "error"
                  ? "Sync didn't finish"
                  : "Sync to Google Sheet"}
            </DialogTitle>
            <DialogDescription>
              {mode === "first"
                ? "We'll create a new sheet in your Drive and write a Report tab + a Wheel chart. The link will be saved to this level."
                : "We'll clear and rewrite the Report and Wheel tabs of the linked sheet. Other tabs stay untouched."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {phase === "error" && (
            <div
              className="flex gap-2.5 px-3 py-2.5 rounded-md border text-[12.5px]"
              style={{
                background: "var(--danger-soft)",
                borderColor: "var(--danger)",
                color: "var(--danger)",
              }}
            >
              <AlertCircleIcon className="size-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Network failure mid-sync</div>
                <div>
                  The linked sheet wasn't modified. Retry when you're back
                  online.
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="border rounded-md px-3 py-2.5"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-soft)",
              }}
            >
              <div
                className="text-[9.5px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Will write
              </div>
              <div
                className="text-[13px] text-foreground flex flex-col gap-1"
              >
                <span className="inline-flex items-center gap-1.5">
                  <ExternalLinkIcon className="size-3" /> Report tab
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Share2Icon className="size-3" /> Wheel tab (with chart)
                </span>
              </div>
            </div>
            <div
              className="border rounded-md px-3 py-2.5"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-soft)",
              }}
            >
              <div
                className="text-[9.5px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Linked sheet
              </div>
              {mode === "first" ? (
                <div
                  className="text-[12.5px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  None yet — we'll create one in your Drive.
                </div>
              ) : (
                <a
                  href={level.sheet_url ?? "#"}
                  className="text-[12.5px] inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
                  style={{ color: "var(--primary)" }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLinkIcon className="size-[11px] shrink-0" />{" "}
                  {level.title} · sheet
                </a>
              )}
            </div>
          </div>
          <div
            className="px-3 py-2.5 rounded-md border text-[12px] flex items-center gap-2"
            style={{
              background: "var(--surface-strong)",
              borderColor: "var(--hairline)",
              color: "var(--muted-foreground)",
            }}
          >
            <ExternalLinkIcon className="size-3 shrink-0" /> One-way: Sheet →
            Devy edits don't flow back.
          </div>
        </div>

        <DialogFooter>
          {phase === "done" ? (
            <>
              <span
                className="flex-1 text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                style={{ color: "var(--good)" }}
              >
                <CheckCircle2Icon className="size-3.5" /> Synced. Sheet is up
                to date.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <ExternalLinkIcon /> Open sheet
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={phase === "running"}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={run}
                disabled={phase === "running"}
              >
                {phase === "running" ? (
                  <RefreshCwIcon className="animate-spin" />
                ) : mode === "first" ? (
                  <SendIcon />
                ) : (
                  <RefreshCwIcon />
                )}
                {phase === "running"
                  ? "Writing…"
                  : mode === "first"
                    ? "Create & sync"
                    : mode === "error"
                      ? "Retry sync"
                      : "Sync now"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ShareDialog ───────────────────────────────────────────────────────────────

export function ShareDialog({
  open,
  onOpenChange,
  level,
  onRevoke,
  onGenerate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: CareerLevel & { share_token: string | null };
  onRevoke?: () => void;
  onGenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = level.share_token
    ? `https://devy.app/career/share/${level.share_token}`
    : null;

  const copy = () => {
    navigator.clipboard?.writeText(url ?? "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <Share2Icon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Share with a manager</DialogTitle>
            <DialogDescription>
              Read-only view of this level. Anyone with the link can open it —
              no Devy account needed.
            </DialogDescription>
          </div>
        </DialogHeader>

        {url ? (
          <div className="flex flex-col gap-2.5">
            <div
              className="flex items-center gap-2 px-2.5 py-2 rounded-md border"
              style={{
                background: "var(--surface-strong)",
                borderColor: "var(--border)",
              }}
            >
              <Link2Icon className="size-3.5 shrink-0" />
              <code
                className="flex-1 text-[12px] overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {url}
              </code>
              <Button variant="outline" size="xs" onClick={copy}>
                {copied ? <CheckCircle2Icon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="border rounded-md px-3 py-2.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="text-[9.5px] uppercase tracking-wider font-semibold mb-0.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Recipient sees
                </div>
                <div
                  className="text-[12.5px] leading-relaxed text-foreground"
                >
                  Tree + wheel, read-only. No Devy chrome, no edit affordances.
                </div>
              </div>
              <div
                className="border rounded-md px-3 py-2.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="text-[9.5px] uppercase tracking-wider font-semibold mb-0.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Recipient cannot
                </div>
                <div
                  className="text-[12.5px] leading-relaxed text-foreground"
                >
                  Comment, edit, or see your other levels.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="px-4 py-4 rounded-md border text-center text-[12.5px]"
            style={{
              background: "var(--surface-soft)",
              borderStyle: "dashed",
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            No link yet. Generate one to share this level.
          </div>
        )}

        <DialogFooter>
          {url ? (
            <>
              <Button variant="outline" size="sm" onClick={onRevoke}>
                <XCircleIcon /> Revoke link
              </Button>
              <span className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(url, "_blank")}
              >
                <EyeIcon /> Preview
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={onGenerate}>
                <Share2Icon /> Generate share link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EvidenceAddDialog ─────────────────────────────────────────────────────────

export type NewEvidence = {
  kind: EvidenceKind;
  title: string;
  url: string | null;
  card_id?: string;
};

const EV_KINDS: [EvidenceKind, string][] = [
  ["link", "External link"],
  ["text", "Free-form note"],
  ["project", "Project card"],
  ["jira", "Jira card"],
];

export function EvidenceAddDialog({
  open,
  onOpenChange,
  indicator,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: Indicator | null;
  onSave?: (ev: NewEvidence) => void;
}) {
  const [kind, setKind] = useState<EvidenceKind>("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [jiraTitle, setJiraTitle] = useState("");

  useEffect(() => {
    if (open) {
      setKind("link");
      setTitle("");
      setUrl("");
      setText("");
      setJiraKey("");
      setJiraTitle("");
    }
  }, [open]);

  const canSave =
    kind === "link"
      ? title.trim() && url.trim()
      : kind === "text"
        ? !!text.trim()
        : kind === "jira"
          ? jiraKey.trim() && jiraTitle.trim()
          : false;

  const save = () => {
    if (!canSave) return;
    let ev: NewEvidence;
    if (kind === "link") {
      ev = { kind: "link", title: title.trim(), url: url.trim() };
    } else if (kind === "text") {
      ev = { kind: "text", title: text.trim(), url: null };
    } else if (kind === "jira") {
      ev = {
        kind: "jira",
        title: `${jiraKey.trim().toUpperCase()} · ${jiraTitle.trim()}`,
        url: `#${jiraKey.trim()}`,
      };
    } else {
      return;
    }
    onSave?.(ev);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <Link2Icon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Attach evidence</DialogTitle>
            <DialogDescription>
              {indicator ? (
                <>
                  For{" "}
                  <span
                    className="font-mono font-semibold text-foreground"
                  >
                    {indicator.code}
                  </span>{" "}
                  —{" "}
                  {indicator.description.slice(0, 80)}
                  {indicator.description.length > 80 ? "…" : ""}
                </>
              ) : (
                "Add a link, note, or Jira ticket as proof."
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* kind switcher */}
        <div
          className="inline-flex p-0.5 rounded-full border"
          style={{
            background: "var(--surface-strong)",
            borderColor: "var(--border)",
          }}
        >
          {EV_KINDS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="px-3 py-1 rounded-full border-none text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1"
              style={{
                background: kind === k ? "var(--background)" : "transparent",
                color:
                  kind === k
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                boxShadow:
                  kind === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              {k === "text" ? (
                <QuoteIcon className="size-[11px]" />
              ) : k === "project" ? (
                <ExternalLinkIcon className="size-[11px]" />
              ) : k === "jira" ? (
                <Link2Icon className="size-[11px]" />
              ) : (
                <Link2Icon className="size-[11px]" />
              )}
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          {kind === "link" && (
            <>
              <label className="flex flex-col gap-1">
                <span
                  className="text-[9.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Title
                </span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="PR #421 · order-cache TTL"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1">
                <span
                  className="text-[9.5px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  URL
                </span>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/…"
                  type="url"
                />
              </label>
            </>
          )}
          {kind === "text" && (
            <label className="flex flex-col gap-1">
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Note
              </span>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Took point on the L5 review session…"
                autoFocus
              />
            </label>
          )}
          {kind === "project" && (
            <div
              className="p-4 text-center rounded-md border text-[12px]"
              style={{
                background: "var(--surface-soft)",
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <PaperclipIcon className="size-5 mx-auto mb-2 opacity-50" />
              Project card picker — wired in the data layer (follow-up).
            </div>
          )}
          {kind === "jira" && (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-[140px_1fr] gap-2.5">
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[9.5px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Key
                  </span>
                  <Input
                    value={jiraKey}
                    onChange={(e) =>
                      setJiraKey(e.target.value.toUpperCase())
                    }
                    placeholder="ACME-1234"
                    autoFocus
                    className="font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span
                    className="text-[9.5px] uppercase tracking-wider font-semibold"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Summary
                  </span>
                  <Input
                    value={jiraTitle}
                    onChange={(e) => setJiraTitle(e.target.value)}
                    placeholder="Idempotent retry tick for cron orchestrator"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!canSave}
          >
            <PlusIcon /> Attach evidence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EvidenceListDialog ────────────────────────────────────────────────────────

export function EvidenceListDialog({
  open,
  onOpenChange,
  indicator,
  onRemove,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: Indicator | null;
  onRemove?: (evId: string) => void;
  onAdd?: () => void;
}) {
  if (!indicator) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <PaperclipIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>
              All evidence · {indicator.evidence.length}
            </DialogTitle>
            <DialogDescription>
              <span className="font-mono font-semibold text-foreground">
                {indicator.code}
              </span>{" "}
              — {indicator.description.slice(0, 80)}
              {indicator.description.length > 80 ? "…" : ""}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div
          className="max-h-[360px] overflow-y-auto rounded-md border"
          style={{ borderColor: "var(--border)" }}
        >
          {indicator.evidence.length === 0 ? (
            <div
              className="p-5 text-center text-[12px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Nothing yet. Attach a link, note, project card, or Jira ticket.
            </div>
          ) : (
            indicator.evidence.map((ev, i) => (
              <div
                key={ev.id}
                className="grid items-center px-3 py-2.5 gap-2.5"
                style={{
                  gridTemplateColumns: "auto 1fr auto",
                  borderTop: i ? "1px solid var(--hairline-soft)" : "none",
                }}
              >
                <span
                  className="size-[26px] rounded-md inline-flex items-center justify-center"
                  style={{
                    background: "var(--surface-strong)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  {ev.kind === "text" ? (
                    <QuoteIcon className="size-[13px]" />
                  ) : ev.card_id ? (
                    <ExternalLinkIcon className="size-[13px]" />
                  ) : (
                    <Link2Icon className="size-[13px]" />
                  )}
                </span>
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{
                      fontStyle: ev.kind === "text" ? "italic" : "normal",
                    }}
                  >
                    {ev.kind === "text" ? `"${ev.title}"` : ev.title}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {ev.kind === "link"
                      ? "External link"
                      : ev.kind === "text"
                        ? "Note"
                        : ev.kind === "project"
                          ? "Project card"
                          : ev.kind === "jira"
                            ? "Jira ticket"
                            : "Linked"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove?.(ev.id)}
                  className="border-none bg-transparent cursor-pointer text-[11.5px] px-2 py-1 rounded"
                  style={{ color: "var(--danger)" }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <PlusIcon /> Add evidence
          </Button>
          <span className="flex-1" />
          <Button
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── HeaderFieldDialog ─────────────────────────────────────────────────────────

const FIELD_SUGGESTIONS = [
  "Team",
  "Tenure",
  "Location",
  "Manager backup",
  "Promo window",
  "Salary band",
];

export function HeaderFieldDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (fields: Array<{ key: string; value: string }>) => void;
}) {
  const [items, setItems] = useState([{ key: "", value: "" }]);

  useEffect(() => {
    if (open) setItems([{ key: "", value: "" }]);
  }, [open]);

  const setItem = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setItems((arr) =>
      arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    );
  const addRow = () => setItems((arr) => [...arr, { key: "", value: "" }]);
  const removeRow = (i: number) =>
    setItems((arr) =>
      arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr,
    );

  const valid = items.some((it) => it.key.trim() && it.value.trim());

  const save = () => {
    const clean = items
      .filter((it) => it.key.trim() && it.value.trim())
      .map((it) => ({ key: it.key.trim(), value: it.value.trim() }));
    if (clean.length) onSave?.(clean);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <ListPlusIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Add header fields</DialogTitle>
            <DialogDescription>
              Free-form key/value pairs surfaced at the top of every shared
              snapshot.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
              <div
                key={i}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: "1fr 1.4fr auto" }}
              >
                <Input
                  value={it.key}
                  onChange={(e) => setItem(i, { key: e.target.value })}
                  placeholder="Key (e.g. Team)"
                  autoFocus={i === 0}
                />
                <Input
                  value={it.value}
                  onChange={(e) => setItem(i, { value: e.target.value })}
                  placeholder="Value (e.g. Platform)"
                />
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => removeRow(i)}
                  className="border-none bg-transparent cursor-pointer size-7 inline-flex items-center justify-center rounded text-muted-foreground"
                >
                  <XCircleIcon className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] cursor-pointer mt-0.5"
              style={{
                background: "transparent",
                borderStyle: "dashed",
                borderColor: "var(--border-strong)",
                color: "var(--muted-foreground)",
              }}
            >
              <PlusIcon className="size-3" /> Add another field
            </button>
          </div>

          <div
            className="rounded-md border px-3 py-2.5"
            style={{
              background: "var(--surface-soft)",
              borderColor: "var(--hairline)",
            }}
          >
            <div
              className="text-[9.5px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Suggestions
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FIELD_SUGGESTIONS.map((s) => {
                const used = items.some(
                  (it) => it.key.trim().toLowerCase() === s.toLowerCase(),
                );
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={used}
                    onClick={() => {
                      const i = items.findIndex((it) => !it.key.trim());
                      if (i >= 0) setItem(i, { key: s });
                      else setItems((arr) => [...arr, { key: s, value: "" }]);
                    }}
                    className="px-2.5 py-0.5 rounded-full border text-[11.5px] cursor-pointer"
                    style={{
                      background: "var(--surface-card)",
                      borderColor: "var(--border)",
                      color: used ? "var(--muted-soft)" : "var(--foreground)",
                      opacity: used ? 0.5 : 1,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!valid}
          >
            <CheckCircle2Icon /> Save fields
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CompetencyAddDialog ───────────────────────────────────────────────────────

const COMP_PRESETS = [
  "Mentorship",
  "Cross-team collaboration",
  "Operational excellence",
  "Domain expertise",
  "Hiring & interviewing",
  "Product sense",
];

export function CompetencyAddDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const save = () => {
    if (name.trim()) {
      onSave?.(name.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <LayersIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Add a competency</DialogTitle>
            <DialogDescription>
              A grouping for related criteria. You'll add criteria + indicators
              next.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Competency name
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mentorship"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </label>
          <div>
            <div
              className="text-[9.5px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "var(--muted-foreground)" }}
            >
              Common picks
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {COMP_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setName(p)}
                  className="px-2.5 py-1 rounded-full border text-[12px] cursor-pointer font-medium"
                  style={{
                    background:
                      name === p ? "var(--accent-tint)" : "var(--surface-card)",
                    borderColor:
                      name === p ? "var(--primary)" : "var(--border)",
                    color: name === p ? "var(--primary)" : "var(--foreground)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!name.trim()}
          >
            <PlusIcon /> Add competency
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CriterionAddDialog ────────────────────────────────────────────────────────

export function CriterionAddDialog({
  open,
  onOpenChange,
  parentComp,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentComp: { id: string; name: string } | null;
  onSave?: (compId: string, data: { name: string }) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const save = () => {
    if (name.trim() && parentComp) {
      onSave?.(parentComp.id, { name: name.trim() });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <ListChecksIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Add a criterion</DialogTitle>
            <DialogDescription>
              {parentComp ? (
                <>
                  Under{" "}
                  <b className="text-foreground">{parentComp.name}</b>.
                  Criteria are measurable focus areas; indicators sit beneath.
                </>
              ) : null}
            </DialogDescription>
          </div>
        </DialogHeader>

        <label className="flex flex-col gap-1">
          <span
            className="text-[9.5px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--muted-foreground)" }}
          >
            Criterion name
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Code review, Estimation, Mentoring…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </label>
        <div
          className="px-2.5 py-2 rounded text-[11.5px]"
          style={{
            background: "var(--surface-soft)",
            border: "1px solid var(--hairline)",
            color: "var(--muted-foreground)",
          }}
        >
          Targets are set per <b className="text-foreground">indicator</b> once
          you add them — each behavior can demand a different level.
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!name.trim() || !parentComp}
          >
            <PlusIcon /> Add criterion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── IndicatorAddDialog ────────────────────────────────────────────────────────

export function IndicatorAddDialog({
  open,
  onOpenChange,
  parentCrit,
  suggestCode,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCrit: Criterion | null;
  suggestCode?: string;
  onSave?: (
    crId: string,
    data: {
      code: string;
      description: string;
      notes: string;
      score: number;
      target: number;
    },
  ) => void;
}) {
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [score, setScore] = useState(1);
  const [target, setTarget] = useState(3);

  useEffect(() => {
    if (open) {
      setCode(suggestCode ?? "");
      setDescription("");
      setNotes("");
      setScore(1);
      setTarget(3);
    }
  }, [open, suggestCode]);

  const save = () => {
    if (!description.trim() || !parentCrit) return;
    onSave?.(parentCrit.id, {
      code: code.trim() || suggestCode || "X1",
      description: description.trim(),
      notes: notes.trim(),
      score,
      target,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <SquareCheckIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Add an indicator</DialogTitle>
            <DialogDescription>
              {parentCrit ? (
                <>
                  Under <b className="text-foreground">{parentCrit.name}</b>. A
                  specific, observable behaviour you can score.
                </>
              ) : null}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "96px 1fr" }}>
            <label className="flex flex-col gap-1">
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Code
              </span>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={suggestCode ?? "A1"}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Description
              </span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Submits readable, well-structured PRs…"
                autoFocus
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Notes{" "}
              <span
                className="normal-case tracking-normal font-normal"
                style={{ color: "var(--muted-soft)" }}
              >
                (optional)
              </span>
            </span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything that gives context for a reviewer."
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold block mb-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                Target
              </span>
              <div
                className="inline-flex p-0.5 rounded-full border"
                style={{
                  background: "var(--surface-strong)",
                  borderColor: "var(--border)",
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTarget(n)}
                    className="min-w-[32px] h-[26px] px-2.5 rounded-full border-none text-[12px] font-semibold cursor-pointer"
                    style={{
                      background:
                        target === n ? "var(--foreground)" : "transparent",
                      color:
                        target === n
                          ? "var(--background)"
                          : "var(--muted-foreground)",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div
                className="text-[11.5px] mt-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                <b className="text-foreground">{CAREER_LEGEND[target]}</b> —
                what the level expects here.
              </div>
            </div>
            <div>
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold block mb-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                Initial score
              </span>
              <div
                className="inline-flex p-0.5 rounded-full border"
                style={{
                  background: "var(--surface-strong)",
                  borderColor: "var(--border)",
                }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className="min-w-[32px] h-[26px] px-2.5 rounded-full border-none text-[12px] font-semibold cursor-pointer"
                    style={{
                      background:
                        score === n ? "var(--primary)" : "transparent",
                      color:
                        score === n
                          ? "var(--primary-foreground)"
                          : "var(--muted-foreground)",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div
                className="text-[11.5px] mt-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                {CAREER_LEGEND[score]} — where you are today.
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!description.trim() || !parentCrit}
          >
            <PlusIcon /> Add indicator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CommentsDialog ────────────────────────────────────────────────────────────

export function CommentsDialog({
  open,
  onOpenChange,
  indicator,
  onAddComment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: Indicator | null;
  onAddComment?: (indId: string, body: string) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  if (!indicator) return null;

  const comments = indicator.comments ?? [];

  const submit = () => {
    if (!draft.trim()) return;
    onAddComment?.(indicator.id, draft.trim());
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            Comments · {indicator.code}
          </DialogTitle>
          <DialogDescription>
            {indicator.description.slice(0, 80)}
            {indicator.description.length > 80 ? "…" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {comments.length === 0 && (
            <div
              className="p-4.5 text-center text-[12.5px] rounded-md border"
              style={{
                borderStyle: "dashed",
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              No comments yet. Threads are private to you until you share this
              level.
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="grid gap-2.5" style={{ gridTemplateColumns: "auto 1fr" }}>
              <div
                className="size-7 rounded-full border inline-flex items-center justify-center text-[11px] font-semibold"
                style={{
                  background: "var(--secondary)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {c.author_initials}
              </div>
              <div>
                <div className="flex gap-1.5 items-baseline">
                  <span className="text-[12.5px] font-semibold text-foreground">
                    {c.author}
                  </span>
                  <span
                    className="text-[10.5px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {c.when}
                  </span>
                </div>
                <div className="text-[13px] text-foreground mt-0.5 leading-relaxed">
                  {c.body}
                </div>
              </div>
            </div>
          ))}

          <div
            className="flex flex-col gap-2 p-2.5 rounded-md border"
            style={{
              background: "var(--surface-soft)",
              borderColor: "var(--hairline)",
            }}
          >
            <div className="grid gap-2.5 items-start" style={{ gridTemplateColumns: "auto 1fr" }}>
              <div
                className="size-[26px] rounded-full border inline-flex items-center justify-center text-[11px] font-semibold"
                style={{
                  background: "var(--secondary)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                EK
              </div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply or @mention a teammate…"
                rows={2}
                className="w-full px-2 py-1.5 text-[13px] leading-relaxed font-[inherit] text-foreground border rounded-sm outline-none resize-y"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--input)",
                }}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="default"
                size="sm"
                disabled={!draft.trim()}
                onClick={submit}
              >
                <SendIcon /> Send
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DevPlanAddDialog ──────────────────────────────────────────────────────────

export function DevPlanAddDialog({
  open,
  onOpenChange,
  criteria,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  criteria: Criterion[];
  onSave?: (item: {
    title: string;
    start: string;
    due: string;
    status: "not_started";
    criterion_id: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");
  const [criterionId, setCriterionId] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setStart("");
      setDue("");
      setCriterionId(criteria[0]?.id ?? "");
    }
  }, [open, criteria]);

  const fmt = (d: string) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";

  const save = () => {
    if (!title.trim() || !start || !due) return;
    onSave?.({
      title: title.trim(),
      start: fmt(start),
      due: fmt(due),
      status: "not_started",
      criterion_id: criterionId || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <RouteIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Add a development plan item</DialogTitle>
            <DialogDescription>
              What you're going to do, by when, to grow toward your target.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Item
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lead RFC for v2 ingest pipeline"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Start date
              </span>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-9 px-2.5 text-[13px] text-foreground border rounded-md outline-none font-[inherit]"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--input)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-[9.5px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted-foreground)" }}
              >
                Due date
              </span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="h-9 px-2.5 text-[13px] text-foreground border rounded-md outline-none font-[inherit]"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--input)",
                }}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span
              className="text-[9.5px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              Closes gap in{" "}
              <span
                className="normal-case tracking-normal font-normal"
                style={{ color: "var(--muted-soft)" }}
              >
                (optional)
              </span>
            </span>
            <select
              value={criterionId}
              onChange={(e) => setCriterionId(e.target.value)}
              className="h-9 px-2.5 text-[13px] text-foreground border rounded-md outline-none cursor-pointer"
              style={{
                background: "var(--background)",
                borderColor: "var(--input)",
              }}
            >
              <option value="">— No specific criterion —</option>
              {criteria.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={!title.trim() || !start || !due}
          >
            <PlusIcon /> Add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── LegendEditDialog ──────────────────────────────────────────────────────────

export function LegendEditDialog({
  open,
  onOpenChange,
  legend,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legend: ScoreLegend;
  onSave?: (legend: ScoreLegend) => void;
}) {
  const [draft, setDraft] = useState<ScoreLegend>(legend);

  useEffect(() => {
    if (open) setDraft(legend);
  }, [open, legend]);

  const update = (
    n: number,
    key: "title" | "desc",
    value: string,
  ) =>
    setDraft((d) => ({
      ...d,
      [n]: { ...(d[n] ?? { title: "", desc: "" }), [key]: value },
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]" showCloseButton={false}>
        <DialogHeader className="flex-row items-start gap-3">
          <DlgIcon tint>
            <SlidersIcon className="size-[18px]" />
          </DlgIcon>
          <div className="flex-1">
            <DialogTitle>Edit score legend</DialogTitle>
            <DialogDescription>
              Titles and one-line descriptions for scores 1–4. Stored on this
              level.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="grid items-center gap-2"
              style={{ gridTemplateColumns: "32px 1fr 1.6fr" }}
            >
              <span
                className="size-6 rounded-full inline-flex items-center justify-center text-[12px] font-bold"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {n}
              </span>
              <Input
                value={draft[n]?.title ?? ""}
                onChange={(e) => update(n, "title", e.target.value)}
                placeholder="Title (e.g. Solid)"
              />
              <Input
                value={draft[n]?.desc ?? ""}
                onChange={(e) => update(n, "desc", e.target.value)}
                placeholder="One-line description"
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              onSave?.(draft);
              onOpenChange(false);
            }}
          >
            <CheckCircle2Icon /> Save legend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
