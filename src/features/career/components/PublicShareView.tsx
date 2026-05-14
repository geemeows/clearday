// PublicShareView — read-only public share page + comment form.

import { useState } from "react";
import { LockIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { CompetencyBlock } from "./CompetencyBlock";
import { WheelPanel } from "./WheelPanel";
import { HeaderKVs } from "./CareerHeader";
import type { CareerLevel, WheelDataPoint } from "./career-data";

// ── PublicCommentBox ───────────────────────────────────────────────────────────

type SentComment = {
  id: string;
  author: string;
  body: string;
  when: string;
};

export function PublicCommentBox({ levelTitle }: { levelTitle: string }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState<SentComment[]>([]);

  const canSubmit = name.trim().length > 0 && body.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitted((s) => [
      ...s,
      { id: `pc_${Date.now()}`, author: name.trim(), body: body.trim(), when: "just now" },
    ]);
    setBody("");
  };

  return (
    <section
      className="mt-7 p-4.5 rounded-lg border"
      style={{
        background: "var(--surface-card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <MessageCircleIcon className="size-4" style={{ color: "var(--primary)" }} />
        <h3 className="m-0 text-[16px] font-bold text-foreground">
          Leave feedback
        </h3>
        <span className="flex-1" />
        <span
          className="font-mono text-[10.5px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          delivered to owner's inbox
        </span>
      </div>
      <p
        className="m-0 mb-3.5 text-[12.5px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        Comments on this read-only snapshot — no account needed.{" "}
        <b className="text-foreground">{levelTitle}</b> owner gets an inbox
        entry for every reply.
      </p>

      <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (e.g. Priya M.)"
        />
        <select
          className="h-8 px-2.5 text-[13px] rounded-md border outline-none cursor-pointer"
          style={{
            color: "var(--foreground)",
            background: "var(--background)",
            borderColor: "var(--input)",
          }}
          defaultValue="level"
        >
          <option value="level">Whole level</option>
          <option value="competency">A specific competency…</option>
        </select>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Specific, actionable feedback works best."
        rows={3}
        className="w-full px-2.5 py-2 text-[13px] leading-relaxed rounded-md border outline-none resize-y mb-2"
        style={{
          fontFamily: "inherit",
          color: "var(--foreground)",
          background: "var(--background)",
          borderColor: "var(--input)",
        }}
      />

      <div className="flex items-center gap-2">
        <span
          className="flex-1 text-[11.5px]"
          style={{ color: "var(--muted-soft)" }}
        >
          Your name is shown to the level owner; nothing else is collected.
        </span>
        <Button disabled={!canSubmit} onClick={submit}>
          <SendIcon /> Send comment
        </Button>
      </div>

      {submitted.length > 0 && (
        <div
          className="mt-3.5 pt-3 flex flex-col gap-2.5"
          style={{ borderTop: "1px solid var(--hairline-soft)" }}
        >
          <div
            className="text-[9.5px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--muted-foreground)" }}
          >
            Sent · {submitted.length}
          </div>
          {submitted.map((c) => (
            <div
              key={c.id}
              className="px-2.5 py-2 rounded-sm border"
              style={{
                background: "var(--surface-soft)",
                borderColor: "var(--hairline)",
              }}
            >
              <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                <b className="text-foreground">{c.author}</b> · {c.when}
              </div>
              <div
                className="text-[13px] mt-0.5 leading-relaxed text-foreground"
              >
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── PublicShareView ────────────────────────────────────────────────────────────

export function PublicShareView({
  level,
  satPerCriterion,
  criteriaData,
}: {
  level: CareerLevel;
  satPerCriterion: Record<string, { avg: number; target: number; gap: number }>;
  criteriaData: WheelDataPoint[];
}) {
  return (
    <div
      className="max-w-[1080px] mx-auto px-6 pt-6 pb-12"
    >
      <div
        className="flex items-center gap-2.5 mb-4.5 pb-3"
        style={{ borderBottom: "1px solid var(--hairline)" }}
      >
        <span
          className="text-[12.5px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          Shared via Clearday · read-only
        </span>
        <span className="flex-1" />
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px]"
          style={{
            background: "var(--surface-strong)",
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
        >
          <LockIcon className="size-2.5" /> Public link
        </span>
      </div>

      <div className="flex items-baseline gap-3 mb-1">
        <div className="text-[28px] font-bold tracking-[-0.6px] text-foreground">
          {level.title}
        </div>
      </div>

      <div className="mb-4">
        <HeaderKVs kvs={level.header} readOnly />
      </div>

      <div
        className="grid gap-4.5 items-start"
        style={{ gridTemplateColumns: "1.6fr 1fr" }}
      >
        <div>
          {level.competencies.map((c) => (
            <CompetencyBlock
              key={c.id}
              comp={c}
              readOnly
              sat={satPerCriterion}
            />
          ))}
        </div>
        <WheelPanel
          criteria={criteriaData}
          competencies={level.competencies}
        />
      </div>

      <PublicCommentBox levelTitle={level.title} />
    </div>
  );
}
