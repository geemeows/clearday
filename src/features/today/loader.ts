// Pure composer: (signals, briefingEntry, now) → TodayViewModel.
// No React imports, no Supabase client. All I/O is handled by the route loader
// in _app.today.tsx; this module is testable over fixture inputs.

import type { BriefingCacheEntry } from "#/features/briefing/morning-briefing";
import type { MeetingEvent } from "#/features/calendar/events";
import type { PreviewSignal } from "#/features/signals/components/InboxPreviewRow";
import {
  computeWeekStats,
  pickInboxPreview,
  pickNextUp,
  pickTodaySchedule,
} from "#/features/signals/views/today";
import type { BriefingData } from "#/features/today/components/BriefingCard";
import type { InProgressTicket } from "#/features/today/components/InProgressCard";
import type { NowSignal } from "#/features/today/components/MeetingCountdownNow";
import type { DayBar } from "#/features/today/components/PulseBars";
import type { WeekStats } from "#/features/today/components/PulseCard";
import type { DonutSlice } from "#/features/today/components/PulseDonut";
import type { ScheduleBlock } from "#/features/today/components/TodaySchedule";
import { deriveInProgress } from "#/features/today/in-progress";
import type { LinkedItem, StoredSignal } from "#/shared/signal";

export type TodayViewModel = {
  nextUp: NowSignal | null;
  schedule: ScheduleBlock[];
  inboxPreview: PreviewSignal[];
  inProgress: InProgressTicket[];
  weekStats: WeekStats;
  sourceMix: DonutSlice[];
  reviewLatency: number[];
  shipByDay: DayBar[];
  briefing: BriefingData | null;
  hasAiConnected: boolean;
};

const SOURCE_DISPLAY: Record<string, { label: string; cssVar: string }> = {
  github: { label: "GitHub", cssVar: "var(--src-git)" },
  slack: { label: "Slack", cssVar: "var(--src-slack)" },
  calendar: { label: "Calendar", cssVar: "var(--src-cal)" },
  linear: { label: "Linear", cssVar: "var(--src-task)" },
  ai: { label: "AI", cssVar: "var(--src-ai)" },
};

function fmtTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function meetingEventToScheduleBlock(evt: MeetingEvent): ScheduleBlock {
  return {
    t: fmtTime(evt.startsAt),
    end: fmtTime(evt.endsAt),
    title: evt.signal.title,
    kind: evt.isFocus ? "focus" : "meeting",
    join: evt.videoLink !== null ? true : undefined,
  };
}

function linkedItemLabel(item: LinkedItem): string {
  if (item.kind === "pr") return `${item.repo}#${item.number}`;
  return item.key;
}

function storedSignalToPreviewSignal(s: StoredSignal): PreviewSignal {
  let source: string;
  if (s.provider === "github") source = "git";
  else if (s.provider === "slack") source = "slack";
  else source = "task";

  const unread = s.requires_action && !s.dismissed_at ? 1 : 0;

  return {
    id: s.id,
    source,
    title: s.title,
    repo:
      typeof s.payload?.repo === "string" ? s.payload.repo : undefined,
    num:
      typeof s.payload?.number === "number"
        ? `#${s.payload.number}`
        : undefined,
    author:
      typeof s.payload?.author === "string" ? s.payload.author : undefined,
    sub: typeof s.payload?.body === "string" ? s.payload.body : undefined,
    age: s.source_created_at ?? new Date().toISOString(),
    unread,
  };
}

function briefingEntryToBriefingData(entry: BriefingCacheEntry): BriefingData {
  const genDate = new Date(entry.generated_at);
  const hh = String(genDate.getHours()).padStart(2, "0");
  const mm = String(genDate.getMinutes()).padStart(2, "0");
  return {
    model: entry.model,
    duration: "–",
    generatedAt: `${hh}:${mm}`,
    headline: entry.text,
    items: [],
  };
}

/**
 * Composes the Today view-model from raw data. Pure — no I/O, no React.
 */
export function composeTodayViewModel(
  signals: StoredSignal[],
  briefingEntry: BriefingCacheEntry | null,
  now: Date,
): TodayViewModel {
  const nextUpMeeting = pickNextUp(signals, now);
  const nextUp: NowSignal | null = nextUpMeeting
    ? {
        title: nextUpMeeting.signal.title,
        when: nextUpMeeting.startsAt.toISOString(),
        agenda:
          nextUpMeeting.linkedItems.length > 0
            ? nextUpMeeting.linkedItems.map(linkedItemLabel)
            : undefined,
        join: nextUpMeeting.videoLink ?? undefined,
      }
    : null;

  const meetingEvents = pickTodaySchedule(signals, now);
  const schedule = meetingEvents.map(meetingEventToScheduleBlock);

  const previewSignals = pickInboxPreview(signals, 6);
  const inboxPreview = previewSignals.map(storedSignalToPreviewSignal);

  const inProgress = deriveInProgress(signals, now, 5);

  const stats = computeWeekStats(signals, now);

  const weekStats: WeekStats = {
    prs_reviewed: stats.prsReviewed,
    tickets_shipped: stats.ticketsShipped,
    focus_hours: stats.focusHours,
    inbox_zero_days: stats.inboxZeroedDays,
  };

  const sourceMix: DonutSlice[] = stats.sourceMix.map((entry) => {
    const d =
      SOURCE_DISPLAY[entry.source] ?? {
        label: entry.source,
        cssVar: "var(--muted)",
      };
    return { k: d.label, v: entry.count, c: d.cssVar };
  });

  const shipByDay: DayBar[] = stats.shippedByDay.map((entry) => ({
    d: entry.day,
    prs: entry.prs,
    tickets: entry.tickets,
  }));

  const briefing = briefingEntry
    ? briefingEntryToBriefingData(briefingEntry)
    : null;

  return {
    nextUp,
    schedule,
    inboxPreview,
    inProgress,
    weekStats,
    sourceMix,
    reviewLatency: stats.reviewLatencyHours,
    shipByDay,
    briefing,
    hasAiConnected: briefingEntry !== null,
  };
}
