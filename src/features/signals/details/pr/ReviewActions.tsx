import { useState } from "react";
import {
  type DraftRequest,
  defaultDraftRequest,
  defaultOpenUrl,
  defaultRequestConnectUrl,
  draftRefusedMessage,
  type OpenUrl,
  type RequestConnectUrl,
} from "../_shared";
import {
  defaultPrReviewSubmit,
  type PrReviewEvent,
  type PrReviewSubmit,
} from "./_shared";

export function PrReviewActions({
  repo,
  number,
  signalId,
  submit = defaultPrReviewSubmit,
  requestDraft = defaultDraftRequest,
  requestConnectUrl = defaultRequestConnectUrl,
  openUrl = defaultOpenUrl,
  onReplyStart,
  onReplyRollback,
}: {
  repo: string;
  number: number;
  signalId?: string;
  submit?: PrReviewSubmit;
  requestDraft?: DraftRequest;
  requestConnectUrl?: RequestConnectUrl;
  openUrl?: OpenUrl;
  onReplyStart?: (id: string) => void;
  onReplyRollback?: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PrReviewEvent | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "ok"; event: PrReviewEvent }
    | { kind: "error"; message: string; needs_reauth?: boolean }
    | null
  >(null);

  const reauth = async () => {
    setReauthing(true);
    try {
      const out = await requestConnectUrl("github");
      if (out.ok && out.url) {
        openUrl(out.url);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? "reauthorize failed",
          needs_reauth: true,
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "reauthorize failed",
        needs_reauth: true,
      });
    } finally {
      setReauthing(false);
    }
  };

  const draft = async () => {
    if (!signalId) return;
    setDrafting(true);
    setStatus(null);
    try {
      const out = await requestDraft({ signal_id: signalId });
      if (out.ok) {
        setBody(out.draft);
      } else {
        setStatus({
          kind: "error",
          message: out.error ?? draftRefusedMessage(out.reason),
        });
      }
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "draft failed",
      });
    } finally {
      setDrafting(false);
    }
  };

  const run = async (event: PrReviewEvent) => {
    setPending(event);
    setStatus(null);
    if (signalId) onReplyStart?.(signalId);
    try {
      const out = await submit({
        repo,
        number,
        event,
        body: body.trim(),
        signal_id: signalId,
      });
      if (out.ok) {
        setStatus({ kind: "ok", event });
        setBody("");
      } else {
        if (signalId) onReplyRollback?.(signalId);
        setStatus({
          kind: "error",
          message: out.error ?? "review failed",
          needs_reauth: out.needs_reauth,
        });
      }
    } catch (e) {
      if (signalId) onReplyRollback?.(signalId);
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "review failed",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <section
      aria-label="PR review actions"
      className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment (required for Request changes / Comment)"
        aria-label="Review comment"
        rows={3}
        className="w-full resize-y rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-foreground/40"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("APPROVE")}
          disabled={pending !== null}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending === "APPROVE" ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          onClick={() => run("REQUEST_CHANGES")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {pending === "REQUEST_CHANGES" ? "Sending…" : "Request changes"}
        </button>
        <button
          type="button"
          onClick={() => run("COMMENT")}
          disabled={pending !== null || body.trim().length === 0}
          className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending === "COMMENT" ? "Sending…" : "Comment"}
        </button>
        {signalId && (
          <button
            type="button"
            onClick={draft}
            disabled={drafting || pending !== null}
            className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          >
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
        )}
      </div>
      {status?.kind === "ok" && (
        <output className="block text-xs text-emerald-700">
          {status.event === "APPROVE"
            ? "Approved."
            : status.event === "REQUEST_CHANGES"
              ? "Changes requested."
              : "Comment posted."}
        </output>
      )}
      {status?.kind === "error" && (
        <p role="alert" className="text-xs text-rose-700">
          {status.message}
          {status.needs_reauth && (
            <>
              {" "}
              <button
                type="button"
                onClick={reauth}
                disabled={reauthing}
                className="underline disabled:opacity-60"
              >
                {reauthing ? "Reauthorizing…" : "Reauthorize GitHub"}
              </button>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}
