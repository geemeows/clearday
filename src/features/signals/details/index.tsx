import type { StoredSignal } from "#/features/signals/components/InboxView";
import { groupOf } from "#/features/signals/display";
import { MeetingDetail } from "./meeting";
import { TaskDetail } from "./task";

// Per-kind detail dispatcher. Slack and PR groups are not yet routed through
// this dispatcher; the inbox route still renders them inline (migrated in
// follow-up slices). Returning null for unknown / not-yet-routed groups keeps
// this component a safe no-op rather than a crash.
export function SignalDetail({ signal }: { signal: StoredSignal }) {
  const group = groupOf(signal);
  switch (group) {
    case "ticket":
      return <TaskDetail signal={signal} />;
    case "meeting":
      return <MeetingDetail signal={signal} />;
    default:
      return null;
  }
}
