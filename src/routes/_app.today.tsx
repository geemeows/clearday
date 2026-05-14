import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "#/components/ui/button";
import { useAuth } from "#/features/auth/auth";
import type { PreviewSignal } from "#/features/signals/components/InboxPreviewRow";
import { InboxPreviewRow } from "#/features/signals/components/InboxPreviewRow";
import type { BriefingData } from "#/features/today/components/BriefingCard";
import { BriefingCard } from "#/features/today/components/BriefingCard";
import type { InProgressTicket } from "#/features/today/components/InProgressCard";
import { InProgressCard } from "#/features/today/components/InProgressCard";
import type { NowSignal } from "#/features/today/components/MeetingCountdownNow";
import { NextUpHero } from "#/features/today/components/NextUpHero";
import type { WeekStats } from "#/features/today/components/PulseCard";
import { PulseCard } from "#/features/today/components/PulseCard";
import type { ScheduleBlock } from "#/features/today/components/TodaySchedule";
import { TodaySchedule } from "#/features/today/components/TodaySchedule";

// ── Fixture data ─────────────────────────────────────────────────────────────
// Real data wiring (signals store, briefing API, calendar events) is a
// follow-up once the page shape is validated.

const NOW = new Date();
const minsFromNow = (m: number) =>
  new Date(NOW.getTime() + m * 60_000).toISOString();
const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

const NEXT_UP: NowSignal = {
  title: "Standup — Platform team",
  when: minsFromNow(13),
  agenda: [
    "#4821 — Token refresh edge case",
    "Slack adapter retry budget",
    "Incident postmortem followup",
  ],
  join: "meet.google.com/abc-defg-hij",
};

const BRIEFING: BriefingData = {
  model: "haiku 4.5",
  duration: "7s",
  generatedAt: "07:42",
  headline: "Three things stand out this morning.",
  items: [
    {
      id: "b1",
      priority: "high",
      source: "git",
      tag: "REVIEW",
      reason: "13 min until standup",
      title: "#421 — Priya · order-cache TTL",
      body: "Your highest-leverage review. Pinged in #platform-eng, diff is small enough to land before standup.",
      cta: { label: "Open #421", icon: "external-link" },
    },
    {
      id: "b2",
      priority: "watch",
      source: "git",
      tag: "CI",
      reason: "8 min ago",
      title: "main · signal-store integration failed",
      body: "30s timeout on the idempotency test. Looks flaky — re-run before merging anything new.",
      cta: { label: "Re-run job", icon: "refresh-cw" },
    },
    {
      id: "b3",
      priority: "plan",
      source: "calendar",
      tag: "FOCUS",
      reason: "after standup",
      title: "DEV-441 · 75-minute deep block",
      body: "Quiet hours armed. Slack DND, calendar busy, and Inbox autosuppress will engage at 10:30.",
      cta: { label: "Adjust block", icon: "calendar" },
    },
    {
      id: "b4",
      priority: "skip",
      source: "git",
      tag: "AUTO",
      reason: "rule: dependabot",
      title: "#430 — dependabot bumps",
      body: "Your auto-merge rule will land this on green CI. No action needed.",
      cta: { label: "View rule", icon: "settings" },
    },
  ],
};

const PREVIEW_SIGNALS: PreviewSignal[] = [
  {
    id: "s2",
    source: "git",
    title: "feat(signals): batch upsert path for slack webhook",
    repo: "clearday/worker",
    num: "#421",
    author: "priya-w",
    age: minsAgo(22),
    unread: 3,
  },
  {
    id: "s3",
    source: "git",
    title: "fix(auth-proxy): reject expired state token",
    repo: "clearday/auth-proxy",
    num: "#88",
    author: "you",
    age: minsAgo(48),
    unread: 2,
  },
  {
    id: "s5",
    source: "git",
    title: "CI failed — integration suite (signal-store)",
    repo: "clearday/worker",
    num: "main",
    author: "ci",
    age: minsAgo(8),
    unread: 1,
  },
  {
    id: "s6",
    source: "slack",
    title: "@you in #platform-eng",
    sub: "priya: hey — can you take a look at #421 before standup?",
    age: minsAgo(7),
    unread: 1,
  },
  {
    id: "s7",
    source: "slack",
    title: "DM — Rahul M.",
    sub: "rahulm: re: auth-proxy state token — you mentioned a 5min ttl, was that the spec?",
    age: minsAgo(31),
    unread: 2,
  },
  {
    id: "s10",
    source: "task",
    title: "DEV-441 — Add timestamp-replay rejection to slack-webhook",
    sub: "P1 · In progress · Sprint 24",
    age: minsAgo(360),
    unread: 0,
  },
];

const IN_PROGRESS: InProgressTicket[] = [
  {
    id: "DEV-441",
    title: "Add timestamp-replay rejection to slack-webhook",
    p: "P1",
    days: 1,
    pr: "#421",
  },
  {
    id: "DEV-447",
    title: "Cron orchestrator: idempotent retry tick",
    p: "P2",
    days: 3,
    pr: null,
  },
  {
    id: "DEV-401",
    title: "Signal-store upsert benchmarks",
    p: "P3",
    days: 6,
    pr: "#410",
  },
];

const WEEK_STATS: WeekStats = {
  prs_reviewed: 12,
  tickets_shipped: 4,
  focus_hours: 14.5,
  inbox_zero_days: 3,
};

const TODAY_SCHEDULE: ScheduleBlock[] = [
  {
    t: "09:00",
    end: "09:45",
    title: "Deep work — Slack adapter",
    kind: "focus",
  },
  {
    t: "10:00",
    end: "10:15",
    title: "Standup — Platform team",
    kind: "meeting",
    join: true,
  },
  { t: "10:30", end: "10:45", title: "Slack thread cleanup", kind: "buffer" },
  {
    t: "11:00",
    end: "11:30",
    title: "1:1 — Maria",
    kind: "meeting",
    join: true,
  },
  {
    t: "11:45",
    end: "13:00",
    title: "Deep work — DEV-441 replay rejection",
    kind: "focus",
  },
  { t: "13:00", end: "14:00", title: "Lunch", kind: "break" },
  {
    t: "14:00",
    end: "14:45",
    title: "Design review — onboarding flow",
    kind: "meeting",
    join: true,
  },
  {
    t: "15:00",
    end: "16:30",
    title: "Deep work — briefing prompt review",
    kind: "focus",
  },
  { t: "16:30", end: "17:00", title: "Inbox + ship reviews", kind: "buffer" },
];

// ── Page component ────────────────────────────────────────────────────────────

export function TodayPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  // Soft gate: redirect to /onboarding until the user completes setup.
  // Real wiring: replace with a route loader that calls decideOnboardingGate().
  useEffect(() => {
    if (!loading && session && !localStorage.getItem("devy:onboarded")) {
      void navigate({ to: "/onboarding" });
    }
  }, [loading, session, navigate]);
  const firstName =
    (
      (session?.user?.user_metadata?.full_name as string | undefined) ?? ""
    ).split(" ")[0] || "there";

  const previewRows = PREVIEW_SIGNALS.slice(0, 6);
  const unreadCount = previewRows.filter((s) => s.unread > 0).length;

  return (
    <main className="flex-1 overflow-auto" aria-label="Today">
      <div
        style={{
          padding: "32px 40px 64px",
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Greeting */}
        <header style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.6,
              color: "var(--ink)",
            }}
          >
            Good morning, {firstName}.
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14,
              color: "var(--muted-foreground)",
            }}
          >
            {unreadCount} things need you · 3 meetings today · quiet hours end
            at 09:00
          </div>
        </header>

        {/* Pulse */}
        <PulseCard stats={WEEK_STATS} />

        {/* Next up hero */}
        <NextUpHero
          signal={NEXT_UP}
          onStartFocus={() =>
            window.dispatchEvent(new CustomEvent("devy:open-focus-modal"))
          }
          onJoin={() => window.open(NEXT_UP.join, "_blank")}
        />

        {/* Morning briefing */}
        <BriefingCard
          data={BRIEFING}
          aiConnected={true}
          onConnect={() => void navigate({ to: "/settings" })}
        />

        {/* Inbox preview + in-progress */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 20,
          }}
        >
          {/* Needs you */}
          <div
            style={{
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--hairline-soft)",
              background: "var(--surface-card)",
              padding: "20px 16px 12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                padding: "0 6px",
                marginBottom: 8,
              }}
            >
              <span
                style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}
              >
                Needs you
              </span>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                }}
              >
                {unreadCount} unread
              </span>
              <span style={{ flex: 1 }} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ to: "/inbox" })}
              >
                Open inbox
                <ArrowRightIcon size={13} />
              </Button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {previewRows.map((s) => (
                <InboxPreviewRow
                  key={s.id}
                  signal={s}
                  onOpen={() => void navigate({ to: "/inbox" })}
                />
              ))}
            </div>
          </div>

          <InProgressCard tickets={IN_PROGRESS} />
        </div>

        {/* Schedule */}
        <TodaySchedule schedule={TODAY_SCHEDULE} />
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});
