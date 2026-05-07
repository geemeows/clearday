import { apiFetch } from "#/lib/api-client";

export type DraftReplyResultUi =
  | { ok: true; draft: string }
  | { ok: false; reason: string; error?: string };

export type DraftRequest = (params: {
  signal_id: string;
  instruction?: string;
}) => Promise<DraftReplyResultUi>;

export const defaultDraftRequest: DraftRequest = async (params) =>
  (await apiFetch("/api/ai/draft", {
    method: "POST",
    body: params,
  })) as DraftReplyResultUi;

export function draftRefusedMessage(reason: string): string {
  if (reason === "no_provider") return "No AI provider configured.";
  if (reason === "budget_reached")
    return "AI disabled — monthly budget reached.";
  if (reason === "disabled") return "AI is disabled for this account.";
  return "AI draft failed.";
}

export type RequestConnectUrl = (
  provider: string,
) => Promise<{ ok: boolean; url?: string; error?: string }>;

export type OpenUrl = (url: string) => void;

export const defaultRequestConnectUrl: RequestConnectUrl = async (provider) =>
  (await apiFetch(`/api/providers/${provider}/connect-url`)) as {
    ok: boolean;
    url?: string;
    error?: string;
  };

export const defaultOpenUrl: OpenUrl = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
};
