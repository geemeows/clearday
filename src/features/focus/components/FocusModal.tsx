// Focus session modal — wholesale port of `docs/design/devy-ui/overlays.jsx`
// FocusModal. Presentational deep module: FOCUS eyebrow, description with
// inline `@mentions` mono chip, DURATION chips (25/45/60/90/120 min),
// editable SLACK STATUS input with a message-square leading icon, and a
// WILL DO preview block listing the three side effects (Calendar busy
// event w/ computed end time, Slack auto-expiry, dnd.setSnooze).
// Start fires onStart({ minutes, message }) and closes; Cancel just closes.

import { MessageSquare, Play, Target } from "lucide-react";
import { useEffect, useState } from "react";
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
import { cn } from "#/lib/cn";

const DURATIONS: ReadonlyArray<number> = [25, 45, 60, 90, 120];

const DEFAULT_MINUTES = 45;
const DEFAULT_MESSAGE = "Heads down — back at the end of this block";

// Tailwind utilities for the mockup's t-tag helper (uppercase tracked muted).
const TAG_CLASS =
  "font-medium text-[10px] uppercase tracking-[0.4px] text-muted-foreground";

export type FocusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (params: { minutes: number; message: string }) => void;
  defaultMinutes?: number;
  defaultMessage?: string;
};

// Mockup helper: anchor end-time to a fixed 10:00 wall clock so the preview is
// stable regardless of when the modal mounts (mirrors overlays.jsx `fmtEnd`).
function fmtEnd(mins: number): string {
  const end = new Date();
  end.setHours(10, mins, 0, 0);
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2, "0")}`;
}

export function FocusModal({
  open,
  onOpenChange,
  onStart,
  defaultMinutes = DEFAULT_MINUTES,
  defaultMessage = DEFAULT_MESSAGE,
}: FocusModalProps) {
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [message, setMessage] = useState<string>(defaultMessage);

  // Reset to defaults each time the dialog re-opens, so a previous selection
  // doesn't leak into the next session.
  useEffect(() => {
    if (open) {
      setMinutes(defaultMinutes);
      setMessage(defaultMessage);
    }
  }, [open, defaultMinutes, defaultMessage]);

  const handleStart = () => {
    onStart({ minutes, message });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-none sm:max-w-none"
        style={{ width: "min(28.75rem, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <div className={cn("mb-0.5 inline-flex items-center gap-1.5", TAG_CLASS)}>
            <Target className="size-3" aria-hidden />
            <span>Focus</span>
          </div>
          <DialogTitle>Start a focus session</DialogTitle>
          <DialogDescription>
            Sets Slack DND, blocks Calendar, silences alerts except{" "}
            <span className="rounded-[3px] bg-[var(--surface-soft)] px-[5px] py-[1px] font-mono text-xs">
              @mentions
            </span>{" "}
            and meetings starting in &lt;5 min.
          </DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className={TAG_CLASS}>Duration</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => {
              const selected = minutes === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setMinutes(d)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-md px-3 py-[5px] text-sm transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {d} min
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="focus-status" className={TAG_CLASS}>
            Slack status
          </label>
          <div className="relative mt-1.5">
            <MessageSquare
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="focus-status"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Heads down"
              className="pl-8"
            />
          </div>
        </div>

        <section
          aria-label="Will do"
          className="rounded-md border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-3 text-[var(--body)] text-xs leading-7"
        >
          <h4 className={cn("mb-1", TAG_CLASS)}>Will do</h4>
          <div>
            · Write a Calendar busy event (10:00 → {fmtEnd(minutes)})
          </div>
          <div>· Set Slack status with a {minutes}-min auto-expiry</div>
          <div>
            · Call <span className="font-mono">dnd.setSnooze</span> for {minutes}{" "}
            min
          </div>
        </section>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleStart}>
            <Play className="size-3.5" aria-hidden />
            Start {minutes}-min focus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
