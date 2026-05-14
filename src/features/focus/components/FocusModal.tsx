// Focus session modal — listens for `devy:open-focus-modal`, shows duration
// picker + Slack status editor, dispatches `devy:focus-started` on confirm.

import { useEffect, useState } from "react";
import { TargetIcon, PlayIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";

const DURATIONS = [25, 45, 60, 90, 120] as const;

function fmtEnd(startMinutes: number, durationMins: number): string {
  const totalMins = startMinutes + durationMins;
  const h = Math.floor(totalMins / 60) % 24;
  const m = String(totalMins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

type Props = {
  /** When provided, overrides internal open state (controlled). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function FocusModal({ open: controlledOpen, onOpenChange }: Props = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [duration, setDuration] = useState(45);
  const [msg, setMsg] = useState("Heads down — back at the end of this block");

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };

  // Listen for the Shell's focus button event.
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("devy:open-focus-modal", handler);
    return () => window.removeEventListener("devy:open-focus-modal", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStart() {
    window.dispatchEvent(
      new CustomEvent("devy:focus-started", {
        detail: { durationSeconds: duration * 60, message: msg },
      }),
    );
    setOpen(false);
  }

  // Compute end time relative to current hour/minute.
  const now = new Date();
  const startMins = now.getHours() * 60 + now.getMinutes();
  const endLabel = fmtEnd(startMins, duration);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[460px]" showCloseButton={false}>
        <DialogHeader>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 2,
            }}
          >
            <TargetIcon size={13} style={{ color: "var(--primary)" }} />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
              }}
            >
              FOCUS
            </span>
          </div>
          <DialogTitle>Start a focus session</DialogTitle>
          <DialogDescription>
            Sets Slack DND, blocks Calendar, silences alerts except{" "}
            <code
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                background: "var(--surface-soft)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              @mentions
            </code>{" "}
            and meetings starting in &lt;5 min.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Duration picker */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
                marginBottom: 6,
              }}
            >
              DURATION
            </div>
            <div
              style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
            >
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border:
                      duration === d
                        ? "none"
                        : "1px solid var(--border)",
                    background:
                      duration === d
                        ? "var(--foreground)"
                        : "transparent",
                    color:
                      duration === d
                        ? "var(--background)"
                        : "var(--foreground)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: duration === d ? 600 : 400,
                  }}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Slack status */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
                marginBottom: 6,
              }}
            >
              SLACK STATUS
            </div>
            <Input
              value={msg}
              onChange={(e) => setMsg((e.target as HTMLInputElement).value)}
              aria-label="Slack status message"
            />
          </div>

          {/* Summary */}
          <div
            style={{
              background: "var(--surface-soft)",
              borderRadius: "var(--radius-md)",
              padding: 12,
              fontSize: 12,
              color: "var(--muted-foreground)",
              lineHeight: 1.7,
              border: "1px solid var(--hairline-soft)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
                marginBottom: 4,
              }}
            >
              WILL DO
            </div>
            <div>
              · Write a Calendar busy event (now → {endLabel})
            </div>
            <div>
              · Set Slack status with a {duration}-min auto-expiry
            </div>
            <div>
              · Call{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>
                dnd.setSnooze
              </code>{" "}
              for {duration} min
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleStart}>
            <PlayIcon size={14} />
            Start {duration}-min focus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
