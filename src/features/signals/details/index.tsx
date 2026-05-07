import type { StoredSignal } from "#/features/signals/components/InboxView";
import { groupOf } from "#/features/signals/display";
import { MeetingDetail } from "./meeting";
import { SlackDetail } from "./slack";
import { TaskDetail } from "./task";

// Per-kind detail dispatcher. The PR group is not yet routed through this
// dispatcher; the inbox route still renders it inline (migrated in a follow-up
// slice). Returning null for unknown / not-yet-routed groups keeps this
// component a safe no-op rather than a crash.
export function SignalDetail({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const group = groupOf(signal);
  switch (group) {
    case "ticket":
      return <TaskDetail signal={signal} />;
    case "meeting":
      return <MeetingDetail signal={signal} />;
    case "slack":
      return (
        <SlackDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      );
    default:
      return null;
  }
}
