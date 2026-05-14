import { useState, type ReactElement } from "react";
import { signInWithGoogle } from "#/features/auth/auth";
import { OAuthButtonRow } from "#/features/auth/components/OAuthButtonRow";

// Icons inline to avoid a lucide-react import for a standalone auth page.
function WifiIcon(): ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

const INFO_ITEMS = [
  {
    icon: (
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
        <path d="M9 12l2 2 4-4" />
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
      </svg>
    ),
    body: (
      <>
        <strong className="font-semibold text-foreground">App login only.</strong>{" "}
        Google here just verifies your email — Devy does not retain Google
        access tokens at this step.
      </>
    ),
  },
  {
    icon: (
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
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    body: (
      <>
        <strong className="font-semibold text-foreground">
          Tokens stay in your Supabase.
        </strong>{" "}
        Provider tokens for GitHub, Slack and Calendar live in your own backend
        — never on Clearday's servers.
      </>
    ),
  },
  {
    icon: (
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
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    ),
    body: (
      <>
        <strong className="font-semibold text-foreground">
          Connect integrations after.
        </strong>{" "}
        GitHub, Slack and Google Calendar each get a separate consent screen on
        first run.
      </>
    ),
  },
] as const;

export function LoginForm(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const deploymentHost =
    typeof window !== "undefined" ? window.location.hostname : "localhost";

  return (
    <section className="flex flex-col overflow-y-auto bg-background px-10 py-8">
      {/* top bar */}
      <div className="flex items-center justify-end gap-4 text-[13px] text-muted-foreground">
        <span>New here?</span>
        <a
          href="https://github.com/geemeows/clearday"
          className="font-medium text-foreground transition-colors hover:underline"
        >
          Deploy your own
        </a>
      </div>

      {/* centered card */}
      <div className="my-auto w-full max-w-[380px] self-center">
        <h2 className="mb-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.6px] text-foreground">
          Sign in to Devy
        </h2>
        <p className="mb-7 text-[14px] leading-[1.5] text-muted-foreground">
          This is a single-tenant deployment. Only the email matching{" "}
          <code className="rounded px-1 py-[1px] font-mono text-[12px] text-foreground" style={{ background: "var(--surface-strong)" }}>
            ALLOWED_EMAIL
          </code>{" "}
          on this Worker can sign in.
        </p>

        {/* deployment chip */}
        <div
          className="mb-5 flex items-center gap-2.5 rounded-lg border bg-surface-soft px-3 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-primary">
            <WifiIcon />
          </span>
          <div className="flex min-w-0 flex-col gap-[1px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-muted-foreground">
              Deployment
            </span>
            <span className="truncate font-mono text-[12px] text-foreground">
              {deploymentHost}
            </span>
          </div>
          <span
            className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "var(--good, #22c55e)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--good, #22c55e)",
                boxShadow:
                  "0 0 0 3px color-mix(in oklab, var(--good, #22c55e) 18%, transparent)",
              }}
            />
            Online
          </span>
        </div>

        {/* OAuth button */}
        <OAuthButtonRow onSignIn={signInWithGoogle} onError={setError} />

        {/* error */}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[13px] text-destructive"
          >
            {error}
          </p>
        )}

        {/* divider */}
        <div className="my-6 flex items-center gap-3 text-[12px] font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          What you'll authorize next
        </div>

        {/* info list */}
        <ul className="flex flex-col gap-3" data-testid="info-list">
          {INFO_ITEMS.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i} className="flex gap-2.5 text-[13px] leading-[1.5] text-body">
              <span className="mt-[2px] h-4 w-4 shrink-0 text-primary">
                {item.icon}
              </span>
              <span>{item.body}</span>
            </li>
          ))}
        </ul>

        {/* footer */}
        <div
          className="mt-8 border-t pt-[18px] text-[12px] leading-[1.5] text-muted-foreground"
          style={{ borderColor: "var(--hairline-soft)" }}
        >
          By continuing you agree to the{" "}
          <a
            href="/terms"
            className="text-foreground transition-colors hover:underline"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="text-foreground transition-colors hover:underline"
          >
            Privacy notice
          </a>{" "}
          of this self-hosted deployment.
        </div>
      </div>
    </section>
  );
}
