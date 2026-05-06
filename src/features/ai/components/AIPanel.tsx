// Settings → AI provider panel (per PRD #29 mockup #2).
//
// Four sub-sections: provider grid, API key field, monthly budget card,
// privacy toggles. Backend cost tracking and key persistence are
// out of scope — toggles, key field, and validation update local state
// only.

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/components/coss/button";
import { Input } from "#/components/coss/input";
import { Label } from "#/components/coss/label";
import { Switch } from "#/components/coss/switch";
import { AiBudgetCard } from "#/features/ai/components/AiBudgetCard";
import { cn } from "#/lib/cn";

export type AiProvider = {
  id: string;
  name: string;
  model: string;
};

const PROVIDERS: ReadonlyArray<AiProvider> = [
  { id: "anthropic", name: "Anthropic", model: "claude-sonnet-4-5" },
  { id: "openai", name: "OpenAI", model: "gpt-4o" },
  { id: "google", name: "Google", model: "gemini-2.0-flash" },
  { id: "groq", name: "Groq", model: "llama-3.3-70b" },
  { id: "ollama", name: "Local Ollama", model: "llama3.1:8b" },
];

type PrivacyKey =
  | "stripCodeBlocks"
  | "stripFilePaths"
  | "stripSecrets"
  | "stripPrDiffs"
  | "disableOnPersonal";

const PRIVACY_TOGGLES: ReadonlyArray<{ key: PrivacyKey; label: string }> = [
  { key: "stripCodeBlocks", label: "Strip code blocks" },
  { key: "stripFilePaths", label: "Strip file paths" },
  { key: "stripSecrets", label: "Strip secrets" },
  { key: "stripPrDiffs", label: "Strip PR diffs" },
  { key: "disableOnPersonal", label: "Disable AI on personal account" },
];

const DEFAULT_PRIVACY: Record<PrivacyKey, boolean> = {
  stripCodeBlocks: true,
  stripFilePaths: false,
  stripSecrets: true,
  stripPrDiffs: false,
  disableOnPersonal: false,
};

export type AIPanelProps = {
  validator?: (key: string) => Promise<{ ok: boolean; error?: string }>;
};

export function AIPanel({ validator }: AIPanelProps = {}) {
  const [providerId, setProviderId] = useState<string>(PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [validation, setValidation] = useState<
    | { state: "idle" }
    | { state: "validating" }
    | { state: "ok"; label: string }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [privacy, setPrivacy] =
    useState<Record<PrivacyKey, boolean>>(DEFAULT_PRIVACY);

  const validate = useMemo(
    () =>
      validator ??
      (async (key: string) => ({
        ok: key.trim().length > 0,
        error: key.trim().length > 0 ? undefined : "Key is empty",
      })),
    [validator],
  );

  const onValidate = async () => {
    setValidation({ state: "validating" });
    try {
      const result = await validate(apiKey);
      if (result.ok) {
        setValidation({ state: "ok", label: "Last validated just now" });
      } else {
        setValidation({
          state: "error",
          message: result.error ?? "Validation failed",
        });
      }
    } catch (e) {
      setValidation({
        state: "error",
        message: e instanceof Error ? e.message : "Validation failed",
      });
    }
  };

  return (
    <section>
      <header>
        <h2 className="font-semibold text-xl">AI provider</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Pick the model that powers Devy's briefings, summaries, and Cmd-K Ask
          AI.
        </p>
      </header>

      <section className="mt-6">
        <h3 className="font-semibold text-base">Provider</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PROVIDERS.map((p) => {
            const selected = providerId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setProviderId(p.id)}
                className={cn(
                  "rounded-md border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent",
                  selected ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="font-medium text-sm">{p.name}</div>
                <div className="mt-1 font-mono text-muted-foreground text-xs">
                  {p.model}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-semibold text-base">API key</h3>
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor="ai-key" className="sr-only">
            API key
          </Label>
          <Input
            id="ai-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            onClick={onValidate}
            disabled={validation.state === "validating"}
          >
            Validate
          </Button>
        </div>
        {validation.state === "ok" && (
          <p className="mt-2 flex items-center gap-1.5 text-emerald-700 text-sm">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full bg-emerald-500"
            />
            <Check aria-hidden="true" className="size-3.5" />
            {validation.label}
          </p>
        )}
        {validation.state === "error" && (
          <p role="alert" className="mt-2 text-destructive text-sm">
            {validation.message}
          </p>
        )}
      </section>

      <section className="mt-8">
        <AiBudgetCard used={6.42} cap={20} fallbackPct={80} hardStopPct={100} />
      </section>

      <section className="mt-8">
        <h3 className="font-semibold text-base">Privacy</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          Control what leaves your machine before AI calls.
        </p>
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {PRIVACY_TOGGLES.map(({ key, label }) => {
            const id = `privacy-${key}`;
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <Label htmlFor={id} className="font-normal text-sm">
                  {label}
                </Label>
                <Switch
                  id={id}
                  checked={privacy[key]}
                  onCheckedChange={(next) =>
                    setPrivacy((prev) => ({ ...prev, [key]: next }))
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
