// Overflow menu for Career level actions. Composed from coss Popover + a
// list of buttons per CLAUDE.md (no `dropdown-menu` primitive). Mirrors
// docs/design/devy-ui/career.jsx:390-425 (the `…` button next to Share).
//
// Slice 7.4 scope: surface the existing "Generate share link" affordance
// + placeholder "Clone as starting template" / "Archive this level"
// entries. The mockup's "Unlink Google Sheet" item is deferred to 7.5,
// when the SyncPill chrome reshape consolidates Unlink out of
// CareerSyncControls (its existing inline tests pin the current shape).

import { Archive, Copy, MoreHorizontal, Share2 } from "lucide-react";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "#/components/ui/popover";

export type ActionsMenuProps = {
  onShare: () => void;
  onClone?: () => void;
  onArchive?: () => void;
};

export function ActionsMenu({ onShare, onClone, onArchive }: ActionsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Level actions"
        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-56 p-1">
        <MenuItem
          icon={<Share2 className="h-3.5 w-3.5" />}
          label="Generate share link"
          onSelect={onShare}
        />
        <MenuItem
          icon={<Copy className="h-3.5 w-3.5" />}
          label="Clone as starting template"
          onSelect={onClone}
          disabled={!onClone}
        />
        <MenuItem
          icon={<Archive className="h-3.5 w-3.5" />}
          label="Archive this level"
          onSelect={onArchive}
          disabled={!onArchive}
        />
      </PopoverPopup>
    </Popover>
  );
}

function MenuItem({
  icon,
  label,
  onSelect,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.()}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-foreground text-sm hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
