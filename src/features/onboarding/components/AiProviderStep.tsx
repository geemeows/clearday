export type AiProvider =
  | "gemini"
  | "groq"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "skip";

const PROVIDERS: {
  id: AiProvider;
  name: string;
  free: boolean;
  model: string;
  tag: string;
}[] = [
  {
    id: "gemini",
    name: "Gemini",
    free: true,
    model: "gemini-2.5-flash",
    tag: "Fast, generous quota",
  },
  {
    id: "groq",
    name: "Groq",
    free: true,
    model: "llama-3.1-70b",
    tag: "Cheapest tokens",
  },
  {
    id: "openai",
    name: "OpenAI",
    free: false,
    model: "gpt-4o-mini",
    tag: "Reliable default",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    free: false,
    model: "claude-haiku-4-5",
    tag: "Tight summaries",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    free: false,
    model: "any · routed",
    tag: "One key, all models",
  },
  {
    id: "skip",
    name: "Skip for now",
    free: false,
    model: "no briefing",
    tag: "Add a key later",
  },
];

export function AiProviderStep({
  provider,
  onProvider,
  apiKey,
  onApiKey,
}: {
  provider: AiProvider;
  onProvider: (p: AiProvider) => void;
  apiKey: string;
  onApiKey: (k: string) => void;
}) {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.4px",
          textTransform: "uppercase",
          color: "var(--primary)",
          marginBottom: 8,
        }}
      >
        Step 3 of 5
      </div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: "-0.8px",
          margin: "0 0 10px",
        }}
      >
        Pick your AI provider.
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "var(--muted-foreground)",
          lineHeight: 1.55,
          margin: "0 0 32px",
          maxWidth: 580,
        }}
      >
        Devy uses one chat-completion call per morning briefing. Bring your own
        key — most of these have a generous free tier so you don't pay anything
        to dogfood.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {PROVIDERS.map((p) => {
          const selected = provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              data-provider={p.id}
              data-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              onClick={() => onProvider(p.id)}
              style={{
                border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                padding: 14,
                background: selected
                  ? "color-mix(in oklab, var(--primary) 5%, var(--card))"
                  : "var(--card)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                boxShadow: selected
                  ? "0 0 0 3px color-mix(in oklab, var(--primary) 15%, transparent)"
                  : undefined,
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--foreground)",
                }}
              >
                {p.name}
                {p.free && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--good)",
                      background:
                        "color-mix(in oklab, var(--good) 12%, transparent)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    free tier
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--muted-foreground)",
                }}
              >
                {p.model}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                {p.tag}
              </div>
            </button>
          );
        })}
      </div>

      {provider !== "skip" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12.5,
              fontWeight: 500,
              marginBottom: 6,
              color: "var(--foreground)",
            }}
          >
            <span>API key</span>
            <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
              Stored in your Supabase. Never sent to Clearday.
            </span>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            placeholder="sk-… / AIza… / gsk_…"
            autoComplete="off"
            aria-label="API key"
            style={{
              width: "100%",
              height: 38,
              padding: "0 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--input)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: 13.5,
              fontFamily: "var(--font-mono)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            Don't have a key? Get one for your selected provider — takes ~60
            seconds.
          </div>
        </div>
      )}
    </>
  );
}
