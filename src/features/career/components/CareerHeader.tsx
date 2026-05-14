// Career page header components:
//   HeaderKVs — key/value metadata grid
//   LevelSwitcher — active level + archive dropdown
//   SyncPill — Google Sheet sync button
//   ActionsMenu — more-horizontal Popover menu

import { useState } from "react";
import {
  ArchiveIcon,
  ChevronDownIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  Share2Icon,
  UnlinkIcon,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import type { ArchivedLevel, CareerLevel } from "./career-data";

// ── HeaderKVs ─────────────────────────────────────────────────────────────────

export function HeaderKVs({
  kvs,
  readOnly,
  onAddField,
}: {
  kvs: Array<{ key: string; value: string }>;
  readOnly?: boolean;
  onAddField?: () => void;
}) {
  return (
    <div
      className="grid gap-px rounded-md overflow-hidden border"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        background: "var(--border)",
        borderColor: "var(--border)",
      }}
    >
      {kvs.map((kv, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable positional keys
        <div
          key={i}
          className="px-3.5 py-2.5"
          style={{ background: "var(--surface-card)" }}
        >
          <div
            className="text-[9.5px] uppercase tracking-wider font-semibold mb-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {kv.key}
          </div>
          <div className="text-[13px] font-medium text-foreground">
            {kv.value}
          </div>
        </div>
      ))}
      {!readOnly && onAddField && (
        <button
          type="button"
          onClick={onAddField}
          className="px-3.5 py-2.5 border-none text-left cursor-pointer flex items-center gap-1.5 text-[12px]"
          style={{
            background: "var(--surface-card)",
            color: "var(--muted-foreground)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--surface-soft)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--surface-card)";
          }}
        >
          <PlusIcon className="size-3" /> Add field
        </button>
      )}
    </div>
  );
}

// ── LevelSwitcher ─────────────────────────────────────────────────────────────

export function LevelSwitcher({
  active,
  archived,
  onPickArchived,
  onViewArchive,
  onNewLevel,
}: {
  active: CareerLevel;
  archived: ArchivedLevel[];
  onPickArchived?: (a: ArchivedLevel) => void;
  onViewArchive?: () => void;
  onNewLevel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const levelParts = active.title.split("·");
  const levelNum = levelParts[0]?.trim() ?? active.title;
  const levelName = levelParts.slice(1).join("·").trim();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer"
        style={{
          background: "var(--surface-card)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
      >
        <span className="text-[18px] font-bold tracking-tight">
          {levelNum}
        </span>
        <span
          className="text-[13px] font-medium"
          style={{ color: "var(--muted-foreground)" }}
        >
          {levelName}
        </span>
        <span
          className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
          style={{
            background: "var(--good-soft)",
            color: "var(--good)",
          }}
        >
          Active
        </span>
        <ChevronDownIcon className="size-[13px]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-1">
        <div
          className="text-[9.5px] uppercase tracking-wider font-semibold px-2.5 pt-2 pb-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          Active
        </div>
        <div
          className="px-2.5 py-2 rounded-md"
          style={{ background: "var(--accent-tint)" }}
        >
          <div className="text-[13px] font-semibold">{active.title}</div>
          <div
            className="text-[11.5px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            Started {active.created_at}
          </div>
        </div>
        <div className="flex items-baseline px-2.5 pt-3 pb-1">
          <span
            className="text-[9.5px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--muted-foreground)" }}
          >
            Archive
          </span>
          <span
            className="font-mono ml-1.5 text-[10px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {archived.length} archived
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onViewArchive?.();
            }}
            className="border-none bg-transparent cursor-pointer text-[11px] font-semibold p-0"
            style={{ color: "var(--primary)" }}
          >
            View all →
          </button>
        </div>
        {archived.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              setOpen(false);
              onPickArchived?.(a);
            }}
            className="block w-full text-left border-none bg-transparent px-2.5 py-2 rounded-md cursor-pointer"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            <div
              className="text-[13px] font-medium"
              style={{ color: "var(--foreground)" }}
            >
              {a.title}
            </div>
            <div
              className="text-[11.5px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Archived {a.archived_at} · avg {a.summary.current_avg}
            </div>
          </button>
        ))}
        <div
          className="mt-1 pt-1"
          style={{ borderTop: "1px solid var(--hairline)" }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewLevel?.();
            }}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium"
            style={{ color: "var(--primary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            <PlusIcon className="size-[13px]" /> New blank level…
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── SyncPill ──────────────────────────────────────────────────────────────────

export function SyncPill({
  level,
  onOpenSync,
}: {
  level: CareerLevel;
  onOpenSync?: () => void;
}) {
  const linked = !!level.sheet_id;
  return (
    <button
      type="button"
      onClick={onOpenSync}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border cursor-pointer"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
      }}
    >
      <span
        className="size-[18px] rounded inline-flex items-center justify-center text-[11px] font-bold shrink-0"
        style={{ background: "#0F9D58", color: "white" }}
        aria-label="Google Sheets"
      >
        S
      </span>
      {linked ? (
        <>
          <span className="text-[12.5px]">
            Synced{" "}
            <span style={{ color: "var(--muted-foreground)" }}>
              {level.last_synced_at}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1 font-semibold text-[12.5px] pl-1.5"
            style={{
              color: "var(--primary)",
              borderLeft: "1px solid var(--hairline)",
            }}
          >
            <RefreshCwIcon className="size-[11px]" /> Sync now
          </span>
        </>
      ) : (
        <span
          className="text-[12.5px] font-semibold"
          style={{ color: "var(--primary)" }}
        >
          Sync to Google Sheet
        </span>
      )}
    </button>
  );
}

// ── ActionsMenu ───────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md border-none bg-transparent cursor-pointer text-[13px] text-left"
      style={{ color: danger ? "var(--danger)" : "var(--foreground)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function ActionsMenu({
  onShare,
  onArchive,
  onClone,
  onUnlink,
}: {
  onShare?: () => void;
  onArchive?: () => void;
  onClone?: () => void;
  onUnlink?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const wrap = (fn?: () => void) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Level actions" />}
      >
        <MoreHorizontalIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[220px] p-1">
        <MenuItem
          icon={<Share2Icon className="size-[13px]" />}
          label="Generate share link"
          onClick={wrap(onShare)}
        />
        <MenuItem
          icon={<CopyIcon className="size-[13px]" />}
          label="Clone as starting template"
          onClick={wrap(onClone)}
        />
        <MenuItem
          icon={<ArchiveIcon className="size-[13px]" />}
          label="Archive this level"
          onClick={wrap(onArchive)}
        />
        <MenuItem
          icon={<UnlinkIcon className="size-[13px]" />}
          label="Unlink Google Sheet"
          onClick={wrap(onUnlink)}
          danger
        />
      </PopoverContent>
    </Popover>
  );
}

