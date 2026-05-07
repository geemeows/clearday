import type { StoredSignal } from "#/features/signals/components/InboxView";
import { SlackReplyComposer } from "./ReplyComposer";
import { SlackThreadContext } from "./ThreadContext";

export function SlackDetail({
  signal,
  onReplyStart,
  onReplyRollback,
}: {
  signal: StoredSignal;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const channel = signal.payload?.channel as string | undefined;
  const channelName = signal.payload?.channel_name as string | undefined;
  const channelType = signal.payload?.channel_type as string | undefined;
  const author = signal.payload?.author as string | undefined;
  const authorName = signal.payload?.author_name as string | undefined;
  const text = signal.payload?.text as string | undefined;
  const ts = signal.payload?.ts as string | undefined;
  const threadTs = signal.payload?.thread_ts as string | undefined;
  const where =
    channelType === "im"
      ? "Direct message"
      : channelName
        ? `#${channelName}`
        : channel
          ? `#${channel}`
          : null;
  return (
    <div data-slot="slack-detail" className="mt-3 space-y-4 text-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
        {where && (
          <>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="text-foreground">{where}</dd>
          </>
        )}
        {author && (
          <>
            <dt className="text-muted-foreground">From</dt>
            <dd className="text-foreground">
              {authorName ? authorName : `<@${author}>`}
            </dd>
          </>
        )}
      </dl>
      {text && !threadTs && (
        <blockquote className="whitespace-pre-line border-l-2 border-border pl-3 text-muted-foreground">
          {text}
        </blockquote>
      )}
      {channel && threadTs && (
        <SlackThreadContext channel={channel} thread_ts={threadTs} />
      )}
      {channel && (
        <SlackReplyComposer
          channel={channel}
          channelName={channelName}
          thread_ts={threadTs ?? ts}
          signalId={signal.id}
          onReplyStart={onReplyStart}
          onReplyRollback={onReplyRollback}
        />
      )}
    </div>
  );
}
