import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "#/components/ui/button";
import { useAuth } from "#/features/auth/auth";
import type { BriefingCacheEntry } from "#/features/briefing/morning-briefing";
import { supabase } from "#/lib/supabase";
import { listSignals } from "#/features/signals/store";
import { useSignalsLive } from "#/features/signals/realtime";
import { InboxPreviewRow } from "#/features/signals/components/InboxPreviewRow";
import { BriefingCard } from "#/features/today/components/BriefingCard";
import { InProgressCard } from "#/features/today/components/InProgressCard";
import { NextUpHero } from "#/features/today/components/NextUpHero";
import { PulseCard } from "#/features/today/components/PulseCard";
import { TodaySchedule } from "#/features/today/components/TodaySchedule";
import {
  composeTodayViewModel,
  type TodayViewModel,
} from "#/features/today/loader";
import type { SupabaseLike } from "#/shared/db";

const db = supabase as unknown as SupabaseLike;

async function loadBriefingEntry(): Promise<BriefingCacheEntry | null> {
  const { data } = await supabase
    .from("user_preferences")
    .select("briefing")
    .eq("id", true)
    .maybeSingle();
  const cached = (data as { briefing?: unknown } | null)?.briefing;
  if (
    !cached ||
    typeof (cached as Record<string, unknown>).text !== "string"
  ) {
    return null;
  }
  return cached as BriefingCacheEntry;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/today")({
  loader: async (): Promise<TodayViewModel> => {
    const now = new Date();
    const [signals, briefingEntry] = await Promise.all([
      listSignals(db, { includeDismissed: false, includeSnoozed: false }),
      loadBriefingEntry(),
    ]);
    return composeTodayViewModel(signals, briefingEntry, now);
  },
  component: TodayRoute,
  errorComponent: TodayErrorPage,
});

function TodayErrorPage() {
  return (
    <main className="flex-1 overflow-auto" aria-label="Today">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          flexDirection: "column",
          gap: 12,
          color: "var(--muted-foreground)",
        }}
      >
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>
          Failed to load Today
        </div>
        <div style={{ fontSize: 13 }}>
          Check your connection and try refreshing.
        </div>
      </div>
    </main>
  );
}

function TodayRoute() {
  const vm = Route.useLoaderData();
  useSignalsLive();
  return <TodayPage {...vm} />;
}

// ── Page component ────────────────────────────────────────────────────────────

export function TodayPage({
  nextUp,
  schedule,
  inboxPreview,
  inProgress,
  weekStats,
  sourceMix,
  reviewLatency,
  shipByDay,
  briefing,
  hasAiConnected,
}: TodayViewModel) {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  // Soft gate: redirect to /onboarding until setup is complete.
  useEffect(() => {
    if (!loading && session && !localStorage.getItem("devy:onboarded")) {
      void navigate({ to: "/onboarding" });
    }
  }, [loading, session, navigate]);

  const firstName =
    (
      (session?.user?.user_metadata?.full_name as string | undefined) ?? ""
    ).split(" ")[0] || "there";

  const unreadCount = inboxPreview.filter((s) => s.unread > 0).length;
  const meetingCount = schedule.filter((b) => b.kind === "meeting").length;

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
            {unreadCount > 0 ? `${unreadCount} things need you · ` : ""}
            {meetingCount > 0 ? `${meetingCount} meetings today` : "No meetings today"}
          </div>
        </header>

        {/* Pulse */}
        <PulseCard
          stats={weekStats}
          empty={
            weekStats.prs_reviewed === 0 &&
            weekStats.tickets_shipped === 0 &&
            weekStats.focus_hours === 0
          }
          sourceMix={sourceMix}
          reviewLatency={reviewLatency}
          shipByDay={shipByDay}
        />

        {/* Next up hero */}
        {nextUp && (
          <NextUpHero
            signal={nextUp}
            onStartFocus={() =>
              window.dispatchEvent(new CustomEvent("devy:open-focus-modal"))
            }
            onJoin={
              nextUp.join ? () => window.open(nextUp.join, "_blank") : undefined
            }
          />
        )}

        {/* Morning briefing */}
        <BriefingCard
          data={briefing ?? {
            model: "",
            duration: "",
            generatedAt: "",
            headline: "",
            items: [],
          }}
          aiConnected={hasAiConnected}
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
            {inboxPreview.length === 0 ? (
              <div
                style={{
                  padding: "24px 12px",
                  fontSize: 13,
                  color: "var(--muted-foreground)",
                  textAlign: "center",
                }}
              >
                All caught up.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {inboxPreview.map((s) => (
                  <InboxPreviewRow
                    key={s.id}
                    signal={s}
                    onOpen={() => void navigate({ to: "/inbox" })}
                  />
                ))}
              </div>
            )}
          </div>

          <InProgressCard tickets={inProgress} />
        </div>

        {/* Schedule */}
        <TodaySchedule schedule={schedule} />
      </div>
    </main>
  );
}
