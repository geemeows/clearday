// Wholesale port from docs/design/devy-ui/Login.html (Redesign v4 / Slice 12).
//
// Two-column auth shell: brand panel on the left (preview signal cards over a
// gridded gradient), sign-in panel on the right (deployment chip + Google
// OAuth + authorize-next info list). At ≤920px the brand panel collapses and
// the auth panel fills the viewport, matching the mockup's responsive rule.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { Shield, Zap } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { signInWithGoogle } from "#/features/auth/auth";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (context.auth.session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  return <LoginPage onSignIn={() => signInWithGoogle()} />;
}

export type LoginPageProps = {
  onSignIn: () => Promise<unknown>;
  /** Optional override for tests / Storybook so the deployment chip reads a known value. */
  deploymentHost?: string;
};

export function LoginPage({
  onSignIn,
  deploymentHost,
}: LoginPageProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host =
    deploymentHost ??
    (typeof window === "undefined" ? "" : window.location.host);

  async function handleSignIn() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await onSignIn();
    } catch (err) {
      setPending(false);
      setError(
        err instanceof Error ? err.message : "Could not start sign-in. Try again.",
      );
    }
  }

  return (
    <main className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-[var(--canvas)] text-[var(--ink)] lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <section className="flex flex-col overflow-y-auto bg-[var(--canvas)] px-10 py-8">
        <div className="flex items-center justify-end gap-4 text-[13px] text-[var(--muted-foreground)]">
          <span>New here?</span>
          <a
            href="https://github.com/geemeows/clearday"
            className="font-medium text-[var(--foreground)] no-underline hover:underline"
          >
            Deploy your own
          </a>
        </div>

        <div className="my-auto w-full max-w-[380px] self-center">
          <h2 className="mb-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.6px] text-[var(--foreground)]">
            Sign in to Devy
          </h2>
          <p className="mb-7 text-[14px] leading-[1.5] text-[var(--muted-foreground)]">
            This is a single-tenant deployment. Only the email matching{" "}
            <code className="rounded-[4px] bg-[var(--surface-strong)] px-[5px] py-[1px] font-mono text-[11.5px] text-[var(--foreground)]">
              ALLOWED_EMAIL
            </code>{" "}
            on this Worker can sign in.
          </p>

          <DeploymentChip host={host || "devy.local"} />

          <button
            type="button"
            onClick={() => {
              void handleSignIn();
            }}
            disabled={pending}
            data-pending={pending ? "" : undefined}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[14.5px] font-medium text-[var(--foreground)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[background,border-color,box-shadow,transform] duration-[120ms] hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_oklab,var(--ring)_24%,transparent)] disabled:cursor-wait disabled:opacity-70"
          >
            <GoogleMark />
            <span>{pending ? "Redirecting to Google…" : "Continue with Google"}</span>
          </button>

          {error && (
            <p
              role="alert"
              className="mt-3 text-[12.5px] leading-[1.4] text-[var(--destructive)]"
            >
              {error}
            </p>
          )}

          <div className="my-6 flex items-center gap-3 text-[12px] font-medium text-[var(--muted-foreground)] before:h-px before:flex-1 before:bg-[var(--border)] before:content-[''] after:h-px after:flex-1 after:bg-[var(--border)] after:content-['']">
            What you'll authorize next
          </div>

          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            <InfoRow
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <title>Verified</title>
                  <path d="M9 12l2 2 4-4" />
                  <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                </svg>
              }
            >
              <b className="font-semibold text-[var(--foreground)]">App login only.</b>{" "}
              Google here just verifies your email — Devy does not retain Google
              access tokens at this step.
            </InfoRow>
            <InfoRow icon={<Shield aria-hidden="true" />}>
              <b className="font-semibold text-[var(--foreground)]">
                Tokens stay in your Supabase.
              </b>{" "}
              Provider tokens for GitHub, Slack and Calendar live in your own
              backend — never on Clearday's servers.
            </InfoRow>
            <InfoRow icon={<Zap aria-hidden="true" />}>
              <b className="font-semibold text-[var(--foreground)]">
                Connect integrations after.
              </b>{" "}
              GitHub, Slack and Google Calendar each get a separate consent
              screen on first run.
            </InfoRow>
          </ul>

          <div className="mt-8 border-t border-[var(--hairline-soft)] pt-[18px] text-[12px] leading-[1.5] text-[var(--muted-foreground)]">
            By continuing you agree to the{" "}
            <a
              href="/terms"
              className="text-[var(--foreground)] no-underline hover:underline"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="text-[var(--foreground)] no-underline hover:underline"
            >
              Privacy notice
            </a>{" "}
            of this self-hosted deployment.
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandPanel() {
  return (
    <section
      aria-hidden="true"
      className="relative isolate hidden flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_12%_10%,rgba(142,131,250,0.32)_0%,transparent_55%),radial-gradient(90%_70%_at_95%_100%,rgba(44,108,248,0.28)_0%,transparent_60%),linear-gradient(180deg,#050d2c_0%,#01154d_60%,#02091f_100%)] px-10 py-8 text-[#f4f6ff] lg:flex"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:32px_32px] bg-[position:-1px_-1px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black_30%,transparent_80%)]"
      />

      <div className="relative z-[1] flex items-center gap-[10px]">
        <img
          src="/brand/devy-logo.png"
          alt=""
          className="h-7 w-7 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
          width={28}
          height={28}
        />
        <span className="text-[16px] font-semibold tracking-[-0.2px] text-white">
          Devy
        </span>
      </div>

      <div className="relative z-[1] mt-20 max-w-[460px]">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-[10px] py-1 text-[11px] font-semibold uppercase tracking-[0.4px] text-[#cfd6e8]">
          <span className="h-1.5 w-1.5 animate-[pulse_1.8s_infinite] rounded-full bg-[#4ade80] shadow-[0_0_0_0_rgba(74,222,128,0.5)]" />
          Worker · auth.clearday.dev
        </span>
        <h1 className="mx-0 mt-[18px] mb-[14px] text-[40px] font-semibold leading-[1.1] tracking-[-1.2px] text-white">
          Your morning,
          <br />
          <em className="bg-gradient-to-r from-[#a094fb] to-[#4f86fa] bg-clip-text not-italic text-transparent">
            already triaged.
          </em>
        </h1>
        <p className="max-w-[420px] text-[15px] leading-[1.55] text-[#b9c0d3]">
          Devy folds GitHub, Calendar and Slack into one focus surface — so you
          stop bouncing between tabs to find the four things that actually need
          you today.
        </p>
      </div>

      <div className="relative z-[1] mt-14 min-h-0 flex-1">
        <SignalCard
          className="left-[-10px] top-0 rotate-[-1.5deg]"
          tag="Calendar"
          tagClass="bg-[rgba(147,197,253,0.16)] text-[#bfdbfe]"
          meta="in 13 min"
          title="Standup — Platform team"
          sub="9 attendees · Google Meet"
        />
        <SignalCard
          className="left-[60px] top-[88px] rotate-[1.2deg]"
          tag="GitHub"
          tagClass="bg-[rgba(165,180,252,0.16)] text-[#c7d2fe]"
          meta="+184 −47 · #421"
          title="feat(signals): batch upsert path for slack webhook"
          sub="priya-w requested your review · 22 min ago"
        />
        <SignalCard
          className="left-5 top-[196px] rotate-[-0.8deg]"
          tag="Slack"
          tagClass="bg-[rgba(103,232,249,0.16)] text-[#a5f3fc]"
          meta="3 unread"
          title="@rahulm in #platform-eng"
          sub={'"thoughts on the retry budget for the slack adapter?"'}
        />
        <SignalCard
          className="left-[100px] top-[296px] rotate-[1.6deg]"
          tag="Briefing"
          tagClass="bg-[rgba(216,180,254,0.16)] text-[#e9d5ff]"
          meta="07:42"
          title="4 things that need you today"
          sub="2 PR reviews · standup at 9:30 · @rahulm waiting"
        />
      </div>

      <div className="relative z-[1] mt-auto flex items-center justify-between text-[12px] text-[#8c95ad]">
        <span>Open source · self-hosted · MIT</span>
        <span>
          <a
            href="https://github.com/geemeows/clearday"
            className="text-[#cfd6e8] no-underline hover:text-white"
          >
            github.com/geemeows/clearday
          </a>
          <span className="mx-2 inline-block h-[3px] w-[3px] rounded-full bg-[#4a5274] align-middle" />
          <a
            href="https://github.com/geemeows/clearday#readme"
            className="text-[#cfd6e8] no-underline hover:text-white"
          >
            docs
          </a>
        </span>
      </div>
    </section>
  );
}

function SignalCard({
  className,
  tag,
  tagClass,
  meta,
  title,
  sub,
}: {
  className: string;
  tag: string;
  tagClass: string;
  meta: string;
  title: string;
  sub: string;
}) {
  return (
    <div
      className={`absolute w-[360px] rounded-[12px] border border-white/10 bg-white/5 p-[12px_14px] text-[#e7ebf6] shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[10px] ${className}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.2px] ${tagClass}`}
        >
          {tag}
        </span>
        <span className="ml-auto font-mono text-[11.5px] text-[#8a93ad]">{meta}</span>
      </div>
      <div className="mb-1.5 text-[13.5px] font-medium leading-[1.35] text-white">
        {title}
      </div>
      <div className="text-[12px] leading-[1.4] text-[#98a1b8]">{sub}</div>
    </div>
  );
}

function DeploymentChip({ host }: { host: string }) {
  return (
    <div className="mb-5 flex items-center gap-[10px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-[10px]">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--primary)]"
        aria-hidden="true"
      >
        <title>Deployment</title>
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-[var(--muted-foreground)]">
          Deployment
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-[var(--foreground)]">
          {host}
        </span>
      </div>
      <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--good)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--good)_18%,transparent)]" />
        Online
      </span>
    </div>
  );
}

function InfoRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 text-[13px] leading-[1.5] text-[var(--body)]">
      <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--primary)] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="shrink-0"
    >
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.4 5.4 0 0 1 0-3.43V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
