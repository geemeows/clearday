// Left brand panel on the Login page — decorative, aria-hidden.
import type { ReactElement } from "react";

const SIGNAL_CARDS = [
  {
    tag: "Calendar",
    tagClass: "bg-blue-200/20 text-blue-200",
    meta: "in 13 min",
    title: "Standup — Platform team",
    sub: "9 attendees · Google Meet",
    style: { top: 0, left: -10, rotate: "-1.5deg" },
  },
  {
    tag: "GitHub",
    tagClass: "bg-indigo-300/20 text-indigo-200",
    meta: "+184 −47 · #421",
    title: "feat(signals): batch upsert path for slack webhook",
    sub: "priya-w requested your review · 22 min ago",
    style: { top: 88, left: 60, rotate: "1.2deg" },
  },
  {
    tag: "Slack",
    tagClass: "bg-cyan-300/20 text-cyan-200",
    meta: "3 unread",
    title: "@rahulm in #platform-eng",
    sub: '"thoughts on the retry budget for the slack adapter?"',
    style: { top: 196, left: 20, rotate: "-0.8deg" },
  },
  {
    tag: "Briefing",
    tagClass: "bg-purple-300/20 text-purple-200",
    meta: "07:42",
    title: "4 things that need you today",
    sub: "2 PR reviews · standup at 9:30 · @rahulm waiting",
    style: { top: 296, left: 100, rotate: "1.6deg" },
  },
] as const;

export function AuthBrandSurface(): ReactElement {
  return (
    <section
      className="relative hidden flex-col overflow-hidden p-8 lg:flex"
      aria-hidden="true"
      style={{
        background:
          "radial-gradient(120% 80% at 12% 10%, rgba(142,131,250,0.32) 0%, transparent 55%), radial-gradient(90% 70% at 95% 100%, rgba(44,108,248,0.28) 0%, transparent 60%), linear-gradient(180deg,#050d2c 0%,#01154d 60%,#02091f 100%)",
        color: "#f4f6ff",
        isolation: "isolate",
      }}
    >
      {/* grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)",
          backgroundSize: "32px 32px",
          backgroundPosition: "-1px -1px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      {/* brand mark */}
      <div className="relative z-10 flex items-center gap-2.5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: "var(--primary)" }}
        >
          <span className="text-[15px] font-bold text-white">D</span>
        </div>
        <span className="text-base font-semibold tracking-tight text-white">
          Devy
        </span>
      </div>

      {/* copy */}
      <div className="relative z-10 mt-20 max-w-[460px]">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.4px]"
          style={{
            borderColor: "rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "#cfd6e8",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: "#4ade80",
              animation: "brand-pulse 1.8s infinite",
              boxShadow: "0 0 0 0 rgba(74,222,128,0.5)",
            }}
          />
          Worker · auth.clearday.dev
        </span>

        <h1
          className="mt-[18px] mb-3.5 text-[40px] font-semibold leading-[1.1] tracking-[-1.2px] text-white"
        >
          Your morning,
          <br />
          <em
            className="not-italic"
            style={{
              background: "linear-gradient(90deg,#a094fb 0%,#4f86fa 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            already triaged.
          </em>
        </h1>
        <p
          className="max-w-[420px] text-[15px] leading-[1.55]"
          style={{ color: "#b9c0d3" }}
        >
          Devy folds GitHub, Calendar and Slack into one focus surface — so you
          stop bouncing between tabs to find the four things that actually need
          you today.
        </p>
      </div>

      {/* signal preview stack */}
      <div className="relative z-10 mt-14 min-h-0 flex-1">
        {SIGNAL_CARDS.map((card) => (
          <div
            key={card.tag}
            className="absolute w-[360px] rounded-xl p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
            style={{
              top: card.style.top,
              left: card.style.left,
              rotate: card.style.rotate,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(10px)",
              color: "#e7ebf6",
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.2px] ${card.tagClass}`}
              >
                {card.tag}
              </span>
              <span
                className="ml-auto font-mono text-[11.5px]"
                style={{ color: "#8a93ad" }}
              >
                {card.meta}
              </span>
            </div>
            <div
              className="mb-1.5 text-[13.5px] font-medium leading-[1.35] text-white"
            >
              {card.title}
            </div>
            <div
              className="text-[12px] leading-[1.4]"
              style={{ color: "#98a1b8" }}
            >
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div
        className="relative z-10 mt-auto flex items-center justify-between text-xs"
        style={{ color: "#8c95ad" }}
      >
        <span>Open source · self-hosted · MIT</span>
        <span className="flex items-center gap-1">
          <a
            href="https://github.com/geemeows/clearday"
            className="transition-colors"
            style={{ color: "#cfd6e8" }}
            tabIndex={-1}
          >
            github.com/geemeows/clearday
          </a>
          <span
            className="mx-2 inline-block h-[3px] w-[3px] rounded-full"
            style={{ background: "#4a5274" }}
          />
          <a
            href="#"
            className="transition-colors"
            style={{ color: "#cfd6e8" }}
            tabIndex={-1}
          >
            docs
          </a>
        </span>
      </div>

      <style>{`
        @keyframes brand-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5); }
          70%  { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }
      `}</style>
    </section>
  );
}
