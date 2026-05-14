import { useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Switch } from "#/components/ui/switch";

type AiProviderKey = "anthropic" | "openai" | "google" | "groq";

type AiModel = {
  id: string;
  label: string;
  tier: string;
  cost: string;
};

type AiProviderDef = {
  name: string;
  models: AiModel[];
};

const AI_CATALOG: Record<AiProviderKey, AiProviderDef> = {
  anthropic: {
    name: "Anthropic",
    models: [
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        tier: "smartest",
        cost: "$3 / $15 per Mtok",
      },
      {
        id: "claude-opus-4-7",
        label: "Claude Opus 4.7",
        tier: "best reasoning",
        cost: "$15 / $75 per Mtok",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        tier: "fast & cheap",
        cost: "$1 / $5 per Mtok",
      },
    ],
  },
  openai: {
    name: "OpenAI",
    models: [
      {
        id: "gpt-4o",
        label: "GPT-4o",
        tier: "balanced",
        cost: "$2.50 / $10 per Mtok",
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        tier: "fast & cheap",
        cost: "$0.15 / $0.60 per Mtok",
      },
    ],
  },
  google: {
    name: "Google",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        tier: "smartest",
        cost: "$1.25 / $10 per Mtok",
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        tier: "fast & cheap",
        cost: "$0.30 / $2.50 per Mtok",
      },
    ],
  },
  groq: {
    name: "Groq",
    models: [
      {
        id: "llama-3.3-70b",
        label: "Llama 3.3 70B",
        tier: "fast inference",
        cost: "$0.59 / $0.79 per Mtok",
      },
      {
        id: "llama-3.1-8b",
        label: "Llama 3.1 8B",
        tier: "fastest",
        cost: "$0.05 / $0.08 per Mtok",
      },
    ],
  },
};

const PROVIDERS = Object.entries(AI_CATALOG) as [AiProviderKey, AiProviderDef][];

const FALLBACK_THRESHOLD_OPTIONS = [
  { value: "50", label: "50% — switch early" },
  { value: "70", label: "70%" },
  { value: "80", label: "80% — recommended" },
  { value: "90", label: "90%" },
  { value: "off", label: "Never (always primary)" },
];

type PrivacyKey =
  | "stripCodeBlocks"
  | "stripFilePaths"
  | "stripSecrets"
  | "stripPrDiffs"
  | "disableOnPersonal";

const PRIVACY_TOGGLES: ReadonlyArray<{
  key: PrivacyKey;
  label: string;
  desc: string;
}> = [
  {
    key: "stripCodeBlocks",
    label: "Strip code blocks",
    desc: "Removes ``` fenced blocks before sending.",
  },
  {
    key: "stripFilePaths",
    label: "Strip file paths",
    desc: "Replaces /src/foo/bar.ts with [path].",
  },
  {
    key: "stripSecrets",
    label: "Strip secrets",
    desc: "Pattern match: API keys, JWTs, env vars.",
  },
  {
    key: "stripPrDiffs",
    label: "Strip PR diffs",
    desc: "Drops + / − lines entirely.",
  },
  {
    key: "disableOnPersonal",
    label: "Disable AI on personal account",
    desc: "No outbound LLM calls when this profile is active.",
  },
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatMonthReset(now: Date): string {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
}

// Fixture spend — backend wire tracked in #173
const FIXTURE_SPENT = 8.41;

const selectCls =
  "h-8 w-full cursor-pointer appearance-none rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--background)] px-3 font-mono text-[13px] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]";

function ModelSelect({
  value,
  onChange,
  models,
  label,
}: {
  value: string;
  onChange: (val: string) => void;
  models: AiModel[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={selectCls}
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label} — {m.tier}
        </option>
      ))}
    </select>
  );
}

export type AIPanelProps = {
  validator?: (key: string) => Promise<{ ok: boolean; error?: string }>;
};

export function AIPanel({ validator }: AIPanelProps = {}) {
  const [provider, setProvider] = useState<AiProviderKey>("anthropic");
  const cat = AI_CATALOG[provider];

  const [primaryModel, setPrimaryModel] = useState(cat.models[0].id);
  const [fallbackModel, setFallbackModel] = useState(
    cat.models[cat.models.length - 1].id,
  );
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validatedAt, setValidatedAt] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [monthlyCap, setMonthlyCap] = useState("25");
  const [fallbackThreshold, setFallbackThreshold] = useState("80");
  const [privacy, setPrivacy] = useState<Record<PrivacyKey, boolean>>({
    stripCodeBlocks: true,
    stripFilePaths: false,
    stripSecrets: true,
    stripPrDiffs: false,
    disableOnPersonal: false,
  });

  // When provider changes, reset model selections to that provider's first/last.
  const prevProviderRef = useRef(provider);
  if (provider !== prevProviderRef.current) {
    prevProviderRef.current = provider;
    const newCat = AI_CATALOG[provider];
    setPrimaryModel(newCat.models[0].id);
    setFallbackModel(newCat.models[newCat.models.length - 1].id);
  }

  const doValidate = async () => {
    const fn =
      validator ??
      (async (key: string) => ({
        ok: key.trim().length > 0,
        error: key.trim().length > 0 ? undefined : "Key is empty",
      }));
    setValidating(true);
    setValidationError(null);
    try {
      const result = await fn(apiKey);
      if (result.ok) {
        setValidatedAt(new Date().toISOString());
      } else {
        setValidationError(result.error ?? "Validation failed");
      }
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const cap = Number.parseFloat(monthlyCap) || 25;
  const spent = FIXTURE_SPENT;
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  const fallbackAmountNum =
    fallbackThreshold !== "off"
      ? (cap * Number.parseInt(fallbackThreshold)) / 100
      : null;
  const resetsLabel = formatMonthReset(new Date());

  const primaryMeta = cat.models.find((m) => m.id === primaryModel) ?? cat.models[0];
  const fallbackMeta =
    cat.models.find((m) => m.id === fallbackModel) ??
    cat.models[cat.models.length - 1];

  const tMono = "font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--muted)]";
  const tBodySm = "text-[11px] text-[var(--muted)]";
  const h3Cls = "mb-2.5 text-[14px] font-semibold text-[var(--ink)]";
  const cardCls =
    "mb-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]";

  return (
    <div>
      {/* SectionHead */}
      <div className="mb-[18px]">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
          AI provider
        </h2>
        <p className="mt-1 text-[var(--muted)]">
          Bring your own key. Devy never stores prompts; spend tracked locally
          in your Supabase.
        </p>
      </div>

      {/* Provider grid */}
      <h3 className={h3Cls}>Provider</h3>
      <div className="mb-6 grid grid-cols-4 gap-2.5">
        {PROVIDERS.map(([id, p]) => (
          <button
            key={id}
            type="button"
            aria-pressed={provider === id}
            onClick={() => setProvider(id)}
            className="cursor-pointer rounded-xl px-3 py-4 text-left transition-colors"
            style={{
              background:
                provider === id ? "var(--primary-disabled)" : "var(--canvas)",
              border:
                provider === id
                  ? "1.5px solid var(--primary)"
                  : "1px solid var(--hairline)",
            }}
          >
            <div className="text-[14px] font-semibold text-[var(--ink)]">
              {p.name}
            </div>
            <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">
              {p.models.length} models
            </div>
          </button>
        ))}
      </div>

      {/* Models card */}
      <h3 className={h3Cls}>Models</h3>
      <div className={cardCls}>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={tMono}>PRIMARY MODEL</span>
            <ModelSelect
              value={primaryModel}
              onChange={setPrimaryModel}
              models={cat.models}
              label="Primary model"
            />
            <span className={tBodySm}>
              Used for daily briefing, smart routing, and inbox triage.{" "}
              <span className="font-mono">{primaryMeta.cost}</span>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={tMono}>FALLBACK MODEL</span>
            <ModelSelect
              value={fallbackModel}
              onChange={setFallbackModel}
              models={cat.models}
              label="Fallback model"
            />
            <span className={tBodySm}>
              Used after the budget threshold below — and as the auto-retry on
              rate limits. <span className="font-mono">{fallbackMeta.cost}</span>
            </span>
          </label>
        </div>
      </div>

      {/* API key card */}
      <div className={cardCls}>
        <div className={`mb-2 ${tMono}`}>API KEY</div>
        <div className="mb-1.5 flex gap-2.5">
          <input
            aria-label="API key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-api03-••••••••••••••••••••••"
            className="h-8 flex-1 rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--surface-soft)] px-3 font-mono text-[13px] text-[var(--ink)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={doValidate}
            disabled={validating}
          >
            Validate
          </Button>
        </div>
        {validatedAt && !validationError && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--good)]">
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full bg-emerald-500"
            />
            Last validated just now
          </div>
        )}
        {validationError && (
          <p role="alert" className="text-[11px] text-destructive">
            {validationError}
          </p>
        )}
      </div>

      {/* Monthly budget */}
      <h3 className={h3Cls}>Monthly budget</h3>
      <section
        aria-label="Monthly budget"
        className="mb-6 rounded-lg border border-[var(--hairline-soft)] bg-[var(--canvas)] p-[18px]"
      >
        <div className="mb-2.5 flex items-baseline">
          <span className="text-[32px] font-bold leading-none tracking-tight text-[var(--ink)]">
            ${spent.toFixed(2)}
          </span>
          <span className="ml-1.5 text-[var(--muted)]">
            of ${cap.toFixed(2)} cap
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-[var(--muted)]">
            {pct}% used · resets {resetsLabel}
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-strong)]">
          <div
            className="h-full rounded-full bg-[var(--primary)]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-3 text-[12px] text-[var(--muted)]">
          <span>
            ↓{" "}
            <b className="text-[var(--ink)]">
              Fallback at{" "}
              {fallbackThreshold === "off" ? "never" : `${fallbackThreshold}%`}
            </b>
            {fallbackAmountNum !== null && (
              <> (${fallbackAmountNum.toFixed(2)})</>
            )}{" "}
            → <span className="font-mono">{fallbackMeta.label}</span>
          </span>
          <span>
            ·{" "}
            <b className="text-[var(--ink)]">Hard stop at 100%</b> ($
            {cap.toFixed(2)})
          </span>
        </div>

        {/* Cap + fallback controls */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--hairline-soft)] pt-4">
          <label className="flex flex-col gap-1.5">
            <span className={tMono}>MONTHLY CAP</span>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--muted-foreground)]"
              >
                $
              </span>
              <input
                aria-label="Monthly cap"
                type="number"
                min="1"
                step="1"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(e.target.value)}
                className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--input)] bg-[var(--background)] pl-[22px] pr-3 font-mono text-[13px] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)]"
              />
            </div>
            <span className={tBodySm}>
              Hard stop when reached. Resets on the 1st of each month.
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={tMono}>FALLBACK THRESHOLD</span>
            <select
              aria-label="Fallback threshold"
              value={fallbackThreshold}
              onChange={(e) => setFallbackThreshold(e.target.value)}
              className={selectCls}
            >
              {FALLBACK_THRESHOLD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className={tBodySm}>
              Switches <span className="font-mono">{primaryMeta.label}</span> →{" "}
              <span className="font-mono">{fallbackMeta.label}</span> at this
              percentage.
            </span>
          </label>
        </div>
      </section>

      {/* Privacy */}
      <h3 className={h3Cls}>Privacy</h3>
      <div className="overflow-hidden rounded-lg border border-[var(--hairline-soft)]">
        {PRIVACY_TOGGLES.map(({ key, label, desc }, i) => (
          <div
            key={key}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3.5 px-4 py-3.5"
            style={{
              borderBottom:
                i < PRIVACY_TOGGLES.length - 1
                  ? "1px solid var(--hairline-soft)"
                  : "none",
            }}
          >
            <span className="w-0" />
            <div>
              <div className="text-[14px] font-semibold text-[var(--ink)]">
                {label}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">{desc}</div>
            </div>
            <span />
            <Switch
              id={`privacy-${key}`}
              aria-label={label}
              checked={privacy[key]}
              onCheckedChange={(next) =>
                setPrivacy((prev) => ({ ...prev, [key]: next }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
