import { useState } from "react";
import { useAuth } from "#/features/auth/auth";
import { StepperRail } from "./StepperRail";
import { WelcomeStep } from "./WelcomeStep";
import { IntegrationsStep } from "./IntegrationsStep";
import { AiProviderStep } from "./AiProviderStep";
import type { AiProvider } from "./AiProviderStep";
import { AlertsStep } from "./AlertsStep";
import type { ThresholdMin } from "./AlertsStep";
import { ReadyStep } from "./ReadyStep";

const TOTAL_STEPS = 5;

export function OnboardingFlow({ onFinish }: { onFinish: () => void }) {
  const { session } = useAuth();
  const [step, setStep] = useState(0);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [slackDm, setSlackDm] = useState(true);
  const [webPush, setWebPush] = useState(false);
  const [threshold, setThreshold] = useState<ThresholdMin>(10);

  const userEmail = session?.user?.email ?? "—";
  const isLast = step === TOTAL_STEPS - 1;

  function advance() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      onFinish();
    }
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleConnect(id: string) {
    setConnected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 40,
    padding: "0 18px",
    borderRadius: "var(--radius-md)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid var(--primary)",
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.16), 0 1px 2px rgba(0,0,0,0.06)",
  };

  const btnSecondary: React.CSSProperties = {
    ...btnBase,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "28px 32px 64px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.2px" }}
          >
            Devy
          </span>
        </div>
        <button
          type="button"
          onClick={onFinish}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--muted-foreground)",
            fontSize: 13,
            fontFamily: "inherit",
            padding: 0,
          }}
        >
          Skip setup →
        </button>
      </div>

      {/* Main grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 56,
          flex: 1,
          alignItems: "flex-start",
        }}
      >
        <StepperRail current={step} />

        <main style={{ minWidth: 0 }}>
          {step === 0 && <WelcomeStep userEmail={userEmail} />}
          {step === 1 && (
            <IntegrationsStep connected={connected} onConnect={handleConnect} />
          )}
          {step === 2 && (
            <AiProviderStep
              provider={provider}
              onProvider={setProvider}
              apiKey={apiKey}
              onApiKey={setApiKey}
            />
          )}
          {step === 3 && (
            <AlertsStep
              slackDm={slackDm}
              onSlackDm={setSlackDm}
              webPush={webPush}
              onWebPush={setWebPush}
              threshold={threshold}
              onThreshold={setThreshold}
            />
          )}
          {step === 4 && <ReadyStep />}

          {/* Nav */}
          <div
            style={{
              marginTop: 40,
              paddingTop: 20,
              borderTop: "1px solid var(--hairline-soft)",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              disabled={step === 0}
              onClick={back}
              style={{
                ...btnSecondary,
                opacity: step === 0 ? 0.5 : 1,
                cursor: step === 0 ? "not-allowed" : "pointer",
              }}
            >
              ← Back
            </button>
            <span style={{ flex: 1 }} />
            <span
              style={{ fontSize: 12, color: "var(--muted-foreground)" }}
              aria-live="polite"
            >
              Step {step + 1} of {TOTAL_STEPS}
            </span>
            <button type="button" onClick={advance} style={btnPrimary}>
              {isLast ? "Open Devy →" : "Continue →"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
