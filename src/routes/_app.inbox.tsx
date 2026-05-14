import { createFileRoute } from "@tanstack/react-router";
import { InboxView } from "#/features/signals/components/InboxView";
import type { InboxSignal } from "#/features/signals/components/InboxView";

// ── Fixture data ──────────────────────────────────────────────────────────────
// Real data wiring (signals API, pagination, real-time updates) is a follow-up
// once the page shape is validated.

const NOW = new Date();
const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const minsFromNow = (m: number) =>
  new Date(NOW.getTime() + m * 60_000).toISOString();

const SIGNALS: InboxSignal[] = [
  {
    id: "s1",
    source: "cal",
    kind: "meeting",
    title: "Standup — Platform team",
    sub: "9 attendees · Google Meet",
    age: minsFromNow(13),
    unread: 1,
    agenda: [
      "#4821 — Token refresh edge case",
      "Slack adapter retry budget",
      "Incident postmortem followup",
    ],
  },
  {
    id: "s2",
    source: "git",
    kind: "pr-review",
    title: "feat(signals): batch upsert path for slack webhook",
    repo: "clearday/worker",
    num: "#421",
    author: "priya-w",
    diff: { add: 184, del: 47, files: 8 },
    age: minsAgo(22),
    unread: 3,
    summary:
      "Reworks the slack webhook to batch-upsert signals when a thread emits N replies in a single tick. Adds a fixture-driven test for the dedup path.",
    requires_action: true,
  },
  {
    id: "s3",
    source: "git",
    kind: "pr-comment",
    title: "fix(auth-proxy): reject expired state token",
    repo: "clearday/auth-proxy",
    num: "#88",
    author: "you",
    diff: { add: 31, del: 8, files: 2 },
    age: minsAgo(48),
    unread: 2,
    summary: "Two new comments from @rahulm on the HMAC verification path.",
    requires_action: true,
  },
  {
    id: "s4",
    source: "git",
    kind: "pr-review",
    title: "chore(deps): bump zod 3.23 → 3.24",
    repo: "clearday/worker",
    num: "#430",
    author: "dependabot",
    diff: { add: 1, del: 1, files: 1 },
    age: minsAgo(95),
    unread: 0,
    badge: "auto-rule",
    summary: "Auto-merge candidate.",
  },
  {
    id: "s5",
    source: "git",
    kind: "ci-failure",
    title: "CI failed — integration suite (signal-store)",
    repo: "clearday/worker",
    num: "main",
    author: "ci",
    age: minsAgo(8),
    unread: 1,
    severity: "high",
    summary:
      "Test 'upsert by composite key is idempotent' timed out after 30s. First failure on this branch.",
    requires_action: true,
  },
  {
    id: "s6",
    source: "slack",
    kind: "mention",
    title: "@you in #platform-eng",
    sub: "priya: hey — can you take a look at #421 before standup?",
    age: minsAgo(7),
    unread: 1,
    requires_action: true,
    thread: [
      {
        who: "priya",
        text: "hey — can you take a look at #421 before standup? want to land the batch path today",
        when: minsAgo(7),
      },
    ],
  },
  {
    id: "s7",
    source: "slack",
    kind: "dm",
    title: "DM — Rahul M.",
    sub: "rahulm: re: auth-proxy state token — you mentioned a 5min ttl, was that the spec?",
    age: minsAgo(31),
    unread: 2,
    requires_action: true,
    thread: [
      {
        who: "rahulm",
        text: "re: auth-proxy state token — you mentioned a 5min ttl, was that the spec?",
        when: minsAgo(31),
      },
      {
        who: "rahulm",
        text: "asking because the test fixture has 10min",
        when: minsAgo(30),
      },
    ],
  },
  {
    id: "s8",
    source: "slack",
    kind: "thread",
    title: 'Replies in #infra — "deploy: bump worker to v0.41"',
    sub: "3 new replies from @joon, @maria",
    age: minsAgo(56),
    unread: 3,
  },
  {
    id: "s9",
    source: "slack",
    kind: "broadcast",
    title: "@here in #incidents",
    sub: "maria: prod is green again. RCA going up in 30. tagging @oncall",
    age: minsAgo(118),
    unread: 1,
    requires_action: true,
  },
  {
    id: "s10",
    source: "task",
    kind: "ticket-assigned",
    title: "DEV-441 — Add timestamp-replay rejection to slack-webhook",
    sub: "P1 · In progress · Sprint 24",
    age: minsAgo(60 * 6),
    unread: 0,
    requires_action: true,
  },
  {
    id: "s11",
    source: "task",
    kind: "ticket-assigned",
    title: "DEV-447 — Cron orchestrator: idempotent retry tick",
    sub: "P2 · In progress · Sprint 24",
    age: minsAgo(60 * 26),
    unread: 0,
  },
  {
    id: "s12",
    source: "task",
    kind: "ticket-comment",
    title: "DEV-432 — Privacy redactor patterns",
    sub: "@maria left a comment · Backlog",
    age: minsAgo(60 * 19),
    unread: 1,
    requires_action: true,
  },
  {
    id: "s15",
    source: "cal",
    kind: "meeting-conflict",
    title: "Conflict — Sprint planning vs. 1:1 with Joon",
    sub: "Tomorrow 10:00 · two events overlap",
    age: minsAgo(2),
    unread: 1,
    severity: "warn",
    requires_action: true,
  },
  {
    id: "s16",
    source: "git",
    kind: "pr-review",
    title: "feat(briefing): morning briefing prompt + budget guard",
    repo: "clearday/worker",
    num: "#418",
    author: "joonp",
    diff: { add: 312, del: 12, files: 6 },
    age: minsAgo(60 * 3),
    unread: 5,
    summary:
      "Adds the morning-briefing module with a Gemini-flash default and an 80% budget fallback path.",
    requires_action: true,
  },
];

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/inbox")({
  component: InboxPage,
});

export function InboxPage() {
  return (
    <main
      style={{ flex: 1, overflow: "hidden", display: "flex", height: "100%" }}
    >
      <InboxView signals={SIGNALS} defaultSelectedId="s2" />
    </main>
  );
}
