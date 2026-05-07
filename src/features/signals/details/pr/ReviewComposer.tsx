import { useState } from "react";
import {
  defaultPrReviewSubmit,
  type PrReviewEvent,
  type PrReviewSubmit,
  type PrReviewSubmitDraft,
  type ReviewDraft,
  reviewDraftKey,
} from "./_shared";

export function PrReviewSubmitPanel({
  repo,
  number,
  drafts,
  onCleared,
  submit = defaultPrReviewSubmit,
}: {
  repo: string;
  number: number;
  drafts: Record<string, ReviewDraft>;
  onCleared: () => void;
  submit?: PrReviewSubmit;
}) {
  const draftList = Object.values(drafts);
  const [body, setBody] = useState("");
  const [event, setEvent] = useState<PrReviewEvent>("COMMENT");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (draftList.length === 0) return null;
  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const out = await submit({
        repo,
        number,
        event,
        body: body.trim() || undefined,
        comments: draftList.map((d) => {
          const out: PrReviewSubmitDraft = {
            path: d.path,
            line: d.line,
            side: d.side,
            body: d.body,
          };
          if (typeof d.startLine === "number" && d.startLine < d.line) {
            out.start_line = d.startLine;
            out.start_side = d.side;
          }
          return out;
        }),
      } as Parameters<PrReviewSubmit>[0]);
      if (!out.ok) {
        setError(out.error ?? "submission failed");
        return;
      }
      onCleared();
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section
      aria-label="Pending review"
      data-slot="review-submit-panel"
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--primary)",
        background: "var(--surface-soft)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <header className="flex items-center" style={{ gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          Pending review · {draftList.length}
          {draftList.length === 1 ? " comment" : " comments"}
        </span>
        <button
          type="button"
          onClick={onCleared}
          className="ml-auto"
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          Discard all
        </button>
      </header>
      <ul
        className="m-0 flex flex-col"
        style={{ gap: 4, fontSize: 12, padding: 0, listStyle: "none" }}
      >
        {draftList.map((d) => (
          <li
            key={reviewDraftKey(d)}
            className="flex items-center"
            style={{ gap: 8, color: "var(--muted-foreground)" }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
                color: "var(--ink)",
              }}
            >
              {d.path}:{d.line}
            </span>
            <span className="truncate">{d.body}</span>
          </li>
        ))}
      </ul>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Optional review summary"
        aria-label="Review summary"
        rows={2}
        style={{
          width: "100%",
          padding: 8,
          fontSize: 13,
          fontFamily: "inherit",
          borderRadius: 6,
          border: "1px solid var(--hairline-soft)",
          resize: "vertical",
          background: "var(--canvas)",
          color: "var(--foreground)",
        }}
      />
      <div className="flex items-center" style={{ gap: 8, flexWrap: "wrap" }}>
        {(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as PrReviewEvent[]).map(
          (ev) => (
            <label
              key={ev}
              className="inline-flex items-center"
              style={{ gap: 6, fontSize: 12, cursor: "pointer" }}
            >
              <input
                type="radio"
                name="review-event"
                value={ev}
                checked={event === ev}
                onChange={() => setEvent(ev)}
              />
              {ev === "APPROVE"
                ? "Approve"
                : ev === "REQUEST_CHANGES"
                  ? "Request changes"
                  : "Comment"}
            </label>
          ),
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="ml-auto"
          style={{
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 6,
            border: 0,
            background: submitting ? "var(--surface-strong)" : "var(--primary)",
            color: submitting ? "var(--muted-foreground)" : "var(--canvas)",
            cursor: submitting ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="m-0"
          style={{ fontSize: 12, color: "var(--destructive)" }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
