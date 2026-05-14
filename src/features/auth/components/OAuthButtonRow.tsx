import { useState, type ReactElement } from "react";

interface OAuthButtonRowProps {
  onError?: (msg: string) => void;
  onSignIn: () => Promise<{ error: { message: string } | null }>;
}

export function OAuthButtonRow({
  onError,
  onSignIn,
}: OAuthButtonRowProps): ReactElement {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const { error } = await onSignIn();
    if (error) {
      onError?.(error.message);
      setPending(false);
    }
    // on success the browser redirects — no need to reset pending
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Continue with Google"
      className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border bg-card px-4 py-3 text-[14.5px] font-medium text-foreground shadow-xs transition-colors hover:border-border/80 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-70"
      style={{ borderColor: "var(--border)", height: 48 }}
    >
      {/* Google G mark — official 4-color SVG */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        aria-hidden="true"
        className="shrink-0"
      >
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
      <span>{pending ? "Redirecting to Google…" : "Continue with Google"}</span>
    </button>
  );
}
