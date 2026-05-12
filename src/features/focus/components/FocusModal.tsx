// Focus session modal (per PRD #29 issue #39).
//
// Presentational deep module: duration chips (25/45/60/90/120 min),
// editable Slack status input, and a "Will do" preview block listing
// the side effects (Calendar busy event, Slack status, dnd.setSnooze).
// Start fires onStart({ minutes, message }) and closes the modal;
// Cancel just closes. Backend wiring (POST /api/focus) lives in the
// caller.

import { Target } from "lucide-react";
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
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/cn";

const DURATIONS: ReadonlyArray<number> = [25, 45, 60, 90, 120];

const DEFAULT_MINUTES = 60;
const DEFAULT_MESSAGE = "Heads down — replies after focus";

export type FocusModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (params: { minutes: number; message: string }) => void;
  defaultMinutes?: number;
  defaultMessage?: string;
};

export function FocusModal({
  open,
  onOpenChange,
  onStart,
  defaultMinutes = DEFAULT_MINUTES,
  defaultMessage = DEFAULT_MESSAGE,
}: FocusModalProps) {
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [message, setMessage] = useState<string>(defaultMessage);

  // Reset to defaults each time the dialog re-opens, so a previous
  // selection doesn't leak into the next session.
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
        style={{ width: "min(28rem, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <div className="mb-0.5 inline-flex items-center gap-1.5 font-semibold text-[10px] text-muted-foreground uppercase leading-[1.25] tracking-[0.4px]">
            <Target className="size-3" aria-hidden />
            <span>Focus</span>
          </div>
          <DialogTitle>Start a focus session</DialogTitle>
          <DialogDescription>
            Block your calendar, set Slack status, and snooze notifications.
          </DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className="font-medium text-foreground text-sm">
            Duration
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATIONS.map((d) => {
              const selected = minutes === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setMinutes(d)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {d}m
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="focus-status">Slack status</Label>
          <Input
            id="focus-status"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Heads down"
            className="mt-2"
          />
        </div>

        <section
          aria-label="Will do"
          className="rounded-md border border-[var(--hairline-soft)] bg-[var(--surface-soft)] p-3"
        >
          <h4 className="font-semibold text-[10px] text-muted-foreground uppercase leading-[1.25] tracking-[0.4px]">
            Will do
          </h4>
          <ul className="mt-2 space-y-1 text-muted-foreground text-sm">
            <li>· Add a {minutes}-min "Focus" event on your calendar</li>
            <li>
              · Set Slack status to{" "}
              <span className="text-foreground">
                "{message.trim() || DEFAULT_MESSAGE}"
              </span>
            </li>
            <li>· Snooze Slack notifications (dnd.setSnooze) for {minutes}m</li>
          </ul>
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
            Start focus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
