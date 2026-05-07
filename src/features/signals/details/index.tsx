import type { StoredSignal } from "#/features/signals/components/InboxView";
import { groupOf } from "#/features/signals/display";
import { MeetingDetail } from "./meeting";
import { PRDetail } from "./pr";
import type { PrLiveState } from "./pr/_shared";
import { SlackDetail } from "./slack";
import { TaskDetail } from "./task";

// Per-kind detail dispatcher. Routes the visible signal to the matching
// kind module. Returns null for unknown groups so unrouted kinds are a
// safe no-op rather than a crash.
export function SignalDetail({
  signal,
  onReplyStart,
  onReplyRollback,
  onPrState,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
  onPrState?: (state: PrLiveState) => void;
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
    case "pr":
      return (
        <PRDetail
          signal={signal}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
          onPrState={onPrState}
        />
      );
    default:
      return null;
  }
}
