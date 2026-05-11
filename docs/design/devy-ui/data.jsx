// Realistic engineer day — fixture data for Devy.

// Use real Date.now() as anchor so countdowns always look live
const NOW = new Date();

const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();
const minsFromNow = (m) => new Date(NOW.getTime() + m * 60_000).toISOString();

const SIGNALS = [
  // Calendar — Next up
  {
    id: "s1", source: "cal", kind: "meeting", requires_action: true,
    title: "Standup — Platform team",
    sub: "9 attendees · Google Meet",
    when: minsFromNow(13),
    duration: 15,
    join: "meet.google.com/abc-defg-hij",
    agenda: ["#4821 — Token refresh edge case", "Slack adapter retry budget", "Incident postmortem followup"],
    unread: 1,
  },
  // GitHub
  {
    id: "s2", source: "git", kind: "pr-review", requires_action: true,
    title: "feat(signals): batch upsert path for slack webhook",
    repo: "clearday/worker", num: "#421",
    author: "priya-w",
    diff: { add: 184, del: 47, files: 8 },
    age: minsAgo(22),
    unread: 3,
    summary: "Reworks the slack webhook to batch-upsert signals when a thread emits N replies in a single tick. Adds a fixture-driven test for the dedup path.",
  },
  {
    id: "s3", source: "git", kind: "pr-comment", requires_action: true,
    title: "fix(auth-proxy): reject expired state token",
    repo: "clearday/auth-proxy", num: "#88",
    author: "you",
    diff: { add: 31, del: 8, files: 2 },
    age: minsAgo(48),
    unread: 2,
    summary: "Two new comments from @rahulm on the HMAC verification path.",
  },
  {
    id: "s4", source: "git", kind: "pr-review", requires_action: true,
    title: "chore(deps): bump zod 3.23 → 3.24",
    repo: "clearday/worker", num: "#430",
    author: "dependabot",
    diff: { add: 1, del: 1, files: 1 },
    age: minsAgo(95),
    unread: 0,
    summary: "Auto-merge candidate.",
    snoozed: false, badge: "auto-rule",
  },
  {
    id: "s5", source: "git", kind: "ci-failure", requires_action: true,
    title: "CI failed — integration suite (signal-store)",
    repo: "clearday/worker",
    num: "main",
    author: "ci",
    age: minsAgo(8),
    unread: 1,
    summary: "Test 'upsert by composite key is idempotent' timed out after 30s. First failure on this branch.",
    severity: "high",
  },
  // Slack
  {
    id: "s6", source: "slack", kind: "mention", requires_action: true,
    title: "@you in #platform-eng",
    sub: "priya: hey — can you take a look at #421 before standup? want to land the batch path today",
    age: minsAgo(7),
    unread: 1,
    thread: [
      { who: "priya", text: "hey — can you take a look at #421 before standup? want to land the batch path today", when: minsAgo(7) },
    ],
  },
  {
    id: "s7", source: "slack", kind: "dm", requires_action: true,
    title: "DM — Rahul M.",
    sub: "rahulm: re: auth-proxy state token — you mentioned a 5min ttl, was that the spec?",
    age: minsAgo(31),
    unread: 2,
    thread: [
      { who: "rahulm", text: "re: auth-proxy state token — you mentioned a 5min ttl, was that the spec?", when: minsAgo(31) },
      { who: "rahulm", text: "asking because the test fixture has 10min", when: minsAgo(30) },
    ],
  },
  {
    id: "s8", source: "slack", kind: "thread", requires_action: false,
    title: "Replies in #infra — \"deploy: bump worker to v0.41\"",
    sub: "3 new replies from @joon, @maria",
    age: minsAgo(56),
    unread: 3,
  },
  {
    id: "s9", source: "slack", kind: "broadcast", requires_action: true,
    title: "@here in #incidents",
    sub: "maria: prod is green again. RCA going up in 30. tagging @oncall",
    age: minsAgo(118),
    unread: 1,
  },
  // Tickets
  {
    id: "s10", source: "task", kind: "ticket-assigned", requires_action: true,
    title: "DEV-441 — Add timestamp-replay rejection to slack-webhook",
    sub: "P1 · In progress · Sprint 24",
    age: minsAgo(60 * 6),
    unread: 0,
  },
  {
    id: "s11", source: "task", kind: "ticket-assigned", requires_action: false,
    title: "DEV-447 — Cron orchestrator: idempotent retry tick",
    sub: "P2 · In progress · Sprint 24",
    age: minsAgo(60 * 26),
    unread: 0,
  },
  {
    id: "s12", source: "task", kind: "ticket-comment", requires_action: true,
    title: "DEV-432 — Privacy redactor patterns",
    sub: "@maria left a comment · Backlog",
    age: minsAgo(60 * 19),
    unread: 1,
  },
  // Calendar additional
  {
    id: "s13", source: "cal", kind: "meeting", requires_action: false,
    title: "1:1 — Maria",
    sub: "Google Meet · accepted",
    when: minsFromNow(73), duration: 30,
    unread: 0,
  },
  {
    id: "s14", source: "cal", kind: "meeting", requires_action: false,
    title: "Design review — onboarding flow",
    sub: "5 attendees · Google Meet",
    when: minsFromNow(193), duration: 45,
    unread: 0,
  },
  {
    id: "s15", source: "cal", kind: "meeting-conflict", requires_action: true,
    title: "Conflict — Sprint planning vs. 1:1 with Joon",
    sub: "Tomorrow 10:00 · two events overlap",
    age: minsAgo(2),
    unread: 1,
    severity: "warn",
  },
  // More PRs
  {
    id: "s16", source: "git", kind: "pr-review", requires_action: true,
    title: "feat(briefing): morning briefing prompt + budget guard",
    repo: "clearday/worker", num: "#418",
    author: "joonp",
    diff: { add: 312, del: 12, files: 6 },
    age: minsAgo(60 * 3),
    unread: 5,
    summary: "Adds the morning-briefing module with a Gemini-flash default and an 80% budget fallback path.",
  },
  {
    id: "s17", source: "git", kind: "pr-author", requires_action: false,
    title: "test(quiet-hours): allow-through matrix",
    repo: "clearday/worker", num: "#425",
    author: "you",
    diff: { add: 96, del: 0, files: 1 },
    age: minsAgo(60 * 4),
    unread: 0,
    summary: "Awaiting CI.",
  },
  // Slack low-pri
  {
    id: "s18", source: "slack", kind: "broadcast", requires_action: false,
    title: "@channel in #eng-announce",
    sub: "joon: friday demo will be 30 min not 60. add slides if you have something",
    age: minsAgo(60 * 8),
    unread: 0,
  },
];

// Today schedule (full day)
const TODAY_SCHEDULE = [
  { t: "09:00", end: "09:45", title: "Deep work — Slack adapter", kind: "focus" },
  { t: "10:00", end: "10:15", title: "Standup — Platform team", kind: "meeting", join: true },
  { t: "10:30", end: "10:45", title: "Slack thread cleanup", kind: "buffer" },
  { t: "11:00", end: "11:30", title: "1:1 — Maria", kind: "meeting", join: true },
  { t: "11:45", end: "13:00", title: "Deep work — DEV-441 replay rejection", kind: "focus" },
  { t: "13:00", end: "14:00", title: "Lunch", kind: "break" },
  { t: "14:00", end: "14:45", title: "Design review — onboarding flow", kind: "meeting", join: true },
  { t: "15:00", end: "16:30", title: "Deep work — briefing prompt review", kind: "focus" },
  { t: "16:30", end: "17:00", title: "Inbox + ship reviews", kind: "buffer" },
];

// In-progress tickets
const IN_PROGRESS = [
  { id: "DEV-441", title: "Add timestamp-replay rejection to slack-webhook", p: "P1", days: 1, pr: "#421" },
  { id: "DEV-447", title: "Cron orchestrator: idempotent retry tick", p: "P2", days: 3, pr: null },
  { id: "DEV-401", title: "Signal-store upsert benchmarks", p: "P3", days: 6, pr: "#410" },
];

// Week stats
const WEEK_STATS = {
  prs_reviewed: 12,
  tickets_shipped: 4,
  focus_hours: 14.5,
  inbox_zero_days: 3,
  trend: { prs: +3, tickets: +1, focus: -1.5, zero: 0 },
};

// Sources status
const SOURCES = [
  { id: "git",   name: "GitHub",   status: "good", count: 6,  last: "32s ago" },
  { id: "slack", name: "Slack",    status: "good", count: 4,  last: "live" },
  { id: "cal",   name: "Calendar", status: "good", count: 3,  last: "1m ago" },
  { id: "task",  name: "Linear",   status: "warn", count: 3,  last: "rate-limited · retry 0:42" },
  { id: "ai",    name: "AI · Anthropic", status: "good", count: 0, last: "validated 4m ago" },
];

// Briefing (AI)
const BRIEFING = {
  model: "haiku 4.5",
  duration: "7s",
  generatedAt: "07:42",
  headline: "Three things stand out this morning.",
  items: [
    {
      id: "b1", priority: "high", source: "git",
      tag: "REVIEW", reason: "13 min until standup",
      title: "#421 — Priya · order-cache TTL",
      body: "Your highest-leverage review. Pinged in #platform-eng, diff is small enough to land before standup.",
      cta: { label: "Open #421", icon: "external-link" },
    },
    {
      id: "b2", priority: "watch", source: "git",
      tag: "CI", reason: "8 min ago",
      title: "main · signal-store integration failed",
      body: "30s timeout on the idempotency test. Looks flaky — re-run before merging anything new.",
      cta: { label: "Re-run job", icon: "refresh-cw" },
    },
    {
      id: "b3", priority: "plan", source: "calendar",
      tag: "FOCUS", reason: "after standup",
      title: "DEV-441 · 75-minute deep block",
      body: "Quiet hours armed. Slack DND, calendar busy, and Inbox autosuppress will engage at 10:30.",
      cta: { label: "Adjust block", icon: "calendar" },
    },
    {
      id: "b4", priority: "skip", source: "git",
      tag: "AUTO", reason: "rule: dependabot",
      title: "#430 — dependabot bumps",
      body: "Your auto-merge rule will land this on green CI. No action needed.",
      cta: { label: "View rule", icon: "settings" },
    },
  ],
};

// AI provider connection state. Toggle to false (or set localStorage 'devy.aiConnected' = '0')
// to render the briefing card's empty / connect-provider state.
const _aiLs = (typeof localStorage !== "undefined") ? localStorage.getItem("devy.aiConnected") : null;
const AI_CONNECTED = _aiLs === null ? true : _aiLs !== "0";

window.DevyData = { SIGNALS, TODAY_SCHEDULE, IN_PROGRESS, WEEK_STATS, SOURCES, BRIEFING, NOW, AI_CONNECTED };
