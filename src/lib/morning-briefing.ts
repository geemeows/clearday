// Morning briefing — the first AI feature. Gathers actionable Signals +
// today's meetings, renders a structured prompt, calls the LLM through
// the shared `runAiCall` seam (so the budget meter + redactor + ai_disabled
// toggle apply), and caches the result for the day.
//
// Cache key: (date, provider, model). A settings change (different
// provider or model) invalidates last day's briefing automatically.

import {
  AiCallRefused,
  type AiCallSettings,
  type RunAiCallDeps,
  runAiCall,
} from "#/lib/ai-call";
import type { ChatMessage } from "#/lib/llm-client";
import type { StoredSignal } from "#/lib/signal";

export type BriefingCacheEntry = {
  date: string; // local YYYY-MM-DD as supplied by the caller
  text: string;
  provider: string;
  model: string;
  used_fallback: boolean;
  generated_at: string;
};

export type BriefingCacheStore = {
  load: () => Promise<BriefingCacheEntry | null>;
  save: (entry: BriefingCacheEntry) => Promise<void>;
};

export type GenerateArgs = {
  date: string;
  force?: boolean;
  signals: StoredSignal[];
  settings: AiCallSettings;
  cacheStore: BriefingCacheStore;
  usageStore: RunAiCallDeps["usageStore"];
  fetch: typeof fetch;
  now?: () => Date;
};

export type BriefingResult =
  | {
      ok: true;
      text: string;
      provider: string;
      model: string;
      used_fallback: boolean;
      generated_at: string;
      cached: boolean;
    }
  | {
      ok: false;
      reason: "no_provider" | "budget_reached" | "disabled" | "error";
      error?: string;
    };

export async function generateBriefing(
  args: GenerateArgs,
): Promise<BriefingResult> {
  if (!args.force) {
    const cached = await args.cacheStore.load();
    if (
      cached &&
      cached.date === args.date &&
      cached.provider === args.settings.provider &&
      cached.model === args.settings.defaultModel
    ) {
      return {
        ok: true,
        text: cached.text,
        provider: cached.provider,
        model: cached.model,
        used_fallback: cached.used_fallback,
        generated_at: cached.generated_at,
        cached: true,
      };
    }
  }

  const now = args.now?.() ?? new Date();
  const messages = buildBriefingPrompt(args.signals, args.date, now);

  try {
    const result = await runAiCall(
      { messages, maxOutputTokens: 400 },
      {
        settings: args.settings,
        usageStore: args.usageStore,
        fetch: args.fetch,
        now: args.now,
      },
    );
    const entry: BriefingCacheEntry = {
      date: args.date,
      text: result.response.content.trim(),
      provider: args.settings.provider,
      model: result.model,
      used_fallback: result.usedFallback,
      generated_at: now.toISOString(),
    };
    await args.cacheStore.save(entry);
    return { ok: true, ...entry, cached: false };
  } catch (err) {
    if (err instanceof AiCallRefused) {
      const reason: "no_provider" | "budget_reached" | "disabled" =
        err.reason === "not_configured"
          ? "no_provider"
          : err.reason === "budget_reached"
            ? "budget_reached"
            : "disabled";
      return { ok: false, reason };
    }
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const SYSTEM_PROMPT =
  "You are Devy, a calm, terse morning briefing assistant for a working " +
  "software engineer. Given a structured list of the user's open work " +
  "items (PRs awaiting them, meetings today, mentions, in-progress " +
  "tickets), write a single short paragraph (under 120 words) summarizing " +
  "what they should focus on today. Lead with the most time-sensitive " +
  "thing. Do not list every item; group similar items. Do not use bullet " +
  "lists or markdown. Refer to the user as 'you'.";

// Per-bucket caps. The loader pulls the latest 200 undismissed Signals; a
// comms-heavy day can blow past that with one bucket alone (e.g. 200 mentions
// drowning out the meetings the user actually needs to lead with). Cap each
// bucket and surface the dropped count so the model still knows the overall
// shape of the day.
const MEETING_MAX = 8;
const PR_REVIEW_MAX = 10;
const PR_AUTHORED_MAX = 8;
const MENTION_MAX = 12;

export function buildBriefingPrompt(
  signals: StoredSignal[],
  date: string,
  now: Date,
): ChatMessage[] {
  const todayStart = new Date(`${date}T00:00:00`);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const meetings: string[] = [];
  const prsToReview: string[] = [];
  const prsAuthored: string[] = [];
  const mentions: string[] = [];

  for (const s of signals) {
    if (s.dismissed_at) continue;
    if (s.kind === "meeting") {
      const startsAtRaw = s.payload?.starts_at;
      if (typeof startsAtRaw !== "string") continue;
      const startsAt = new Date(startsAtRaw);
      if (Number.isNaN(startsAt.getTime())) continue;
      if (startsAt < todayStart || startsAt >= todayEnd) continue;
      meetings.push(`- ${formatTime(startsAt)}: ${s.title}`);
    } else if (s.kind === "pr_review_requested") {
      prsToReview.push(`- ${s.title}`);
    } else if (s.kind === "pr_authored" || s.kind === "pr_assigned") {
      prsAuthored.push(`- ${s.title}`);
    } else if (s.kind === "mention" || s.kind === "dm") {
      mentions.push(`- ${s.title}`);
    }
  }

  const sections: string[] = [];
  sections.push(`Date: ${date}`);
  sections.push(`Local time: ${formatTime(now)}`);
  sections.push("");
  appendBucket(sections, "Meetings today", meetings, MEETING_MAX);
  sections.push("");
  appendBucket(
    sections,
    "PRs awaiting your review",
    prsToReview,
    PR_REVIEW_MAX,
  );
  sections.push("");
  appendBucket(
    sections,
    "Your open / assigned PRs",
    prsAuthored,
    PR_AUTHORED_MAX,
  );
  sections.push("");
  appendBucket(sections, "New mentions / DMs", mentions, MENTION_MAX);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: sections.join("\n") },
  ];
}

function appendBucket(
  out: string[],
  label: string,
  rows: string[],
  max: number,
): void {
  out.push(`${label} (${rows.length}):`);
  if (rows.length === 0) {
    out.push("- (none)");
    return;
  }
  if (rows.length <= max) {
    out.push(rows.join("\n"));
    return;
  }
  out.push(rows.slice(0, max).join("\n"));
  out.push(`- (+${rows.length - max} more not shown)`);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
