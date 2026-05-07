import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { apiFetch } from "#/lib/api-client";
import { supabase } from "#/lib/supabase";

export type PrReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export type PrReviewSubmitDraft = {
  path: string;
  line: number;
  side: ReviewDraftSide;
  body: string;
  start_line?: number;
  start_side?: ReviewDraftSide;
};

export type PrReviewSubmit = (params: {
  repo: string;
  number: number;
  event: PrReviewEvent;
  body?: string;
  signal_id?: string;
  comments?: PrReviewSubmitDraft[];
}) => Promise<{ ok: boolean; error?: string; needs_reauth?: boolean }>;

export const defaultPrReviewSubmit: PrReviewSubmit = async (params) =>
  (await apiFetch("/api/pr/review", {
    method: "POST",
    body: params,
  })) as { ok: boolean; error?: string; needs_reauth?: boolean };

export type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

export type PrFilesResult =
  | { ok: true; files: PrFile[] }
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

export type PrFilesLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrFilesResult>;

export const defaultPrFilesLoader: PrFilesLoader = async ({ repo, number }) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/files?${qs}`)) as PrFilesResult;
};

export type PrReviewComment = {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  diff_hunk: string | null;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrIssueComment = {
  id: number;
  body: string;
  user: string | null;
  user_avatar_url: string | null;
  created_at: string | null;
};

export type PrLiveState = {
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
};

export type PrOverviewResult =
  | ({
      ok: true;
      body: string | null;
      author: string | null;
      author_avatar_url: string | null;
      review_comments: PrReviewComment[];
      issue_comments: PrIssueComment[];
    } & PrLiveState)
  | { ok: false; error: string; reason?: string; needs_reauth?: boolean };

export type PrOverviewLoader = (params: {
  repo: string;
  number: number;
}) => Promise<PrOverviewResult>;

export const defaultPrOverviewLoader: PrOverviewLoader = async ({
  repo,
  number,
}) => {
  const qs = `repo=${encodeURIComponent(repo)}&number=${number}`;
  return (await apiFetch(`/api/pr/overview?${qs}`)) as PrOverviewResult;
};

// rehype-sanitize schema based on the GitHub default but with a few extras
// commonly found in PR bodies: image dimensions, video poster, and `align` on
// images / paragraphs (GitHub authors lean on these often).
const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [
      ...((defaultSchema.attributes?.img as Array<unknown>) ?? []),
      "align",
      "width",
      "height",
      "loading",
      "style",
    ],
    a: [
      ...((defaultSchema.attributes?.a as Array<unknown>) ?? []),
      "rel",
      "target",
    ],
    "*": [
      ...((defaultSchema.attributes?.["*"] as Array<unknown>) ?? []),
      "align",
    ],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "video",
    "source",
  ],
};

// Hosts whose images Chrome blocks under ORB or that require a github auth
// token to fetch (user-attachments). These need to go through our worker
// proxy at /api/github/asset, which fetches server-side with the user's
// token and re-emits the bytes from our origin.
const GITHUB_ASSET_PROXY_HOSTS = new Set([
  "github.com",
  "user-images.githubusercontent.com",
  "raw.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
]);

function proxyGithubAssetUrl(
  src: string | undefined,
  authToken: string | null,
): string | undefined {
  if (!src) return src;
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return src;
  }
  if (parsed.protocol !== "https:") return src;
  if (!GITHUB_ASSET_PROXY_HOSTS.has(parsed.hostname)) return src;
  const qs = `url=${encodeURIComponent(parsed.toString())}${
    authToken ? `&auth=${encodeURIComponent(authToken)}` : ""
  }`;
  return `/api/github/asset?${qs}`;
}

function useSupabaseAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);
  return token;
}

export function Markdown({ children }: { children: string }) {
  const authToken = useSupabaseAccessToken();
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
        a: ({ node: _n, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        img: ({ node: _n, src, ...props }) => (
          <img
            {...props}
            src={proxyGithubAssetUrl(
              typeof src === "string" ? src : undefined,
              authToken,
            )}
            loading="lazy"
            alt={props.alt ?? ""}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function groupCommentsByPath(
  comments: PrReviewComment[],
): Record<string, PrReviewComment[]> {
  const out: Record<string, PrReviewComment[]> = {};
  for (const c of comments) {
    if (!c.path) continue;
    if (!out[c.path]) out[c.path] = [];
    out[c.path].push(c);
  }
  return out;
}

export type DiffRow = {
  raw: string;
  tone: "hunk" | "ctx" | "add" | "del";
  oldLine?: number;
  newLine?: number;
};

// Parse a unified patch into rows annotated with each side's file line
// number. Inline review comments target one of those line numbers.
export function parsePatch(patch: string): DiffRow[] {
  const lines = patch.split("\n");
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of lines) {
    if (raw.startsWith("@@")) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLine = Number(m[1]);
        newLine = Number(m[2]);
      }
      rows.push({ raw, tone: "hunk" });
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      rows.push({ raw, tone: "add", newLine });
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") && !raw.startsWith("---")) {
      rows.push({ raw, tone: "del", oldLine });
      oldLine += 1;
      continue;
    }
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ raw, tone: "ctx" });
      continue;
    }
    rows.push({ raw, tone: "ctx", oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }
  return rows;
}

export type ReviewDraftSide = "LEFT" | "RIGHT";

export type ReviewDraft = {
  path: string;
  line: number;
  side: ReviewDraftSide;
  /** Inclusive start of a multi-line range. Omit for single-line drafts. */
  startLine?: number;
  body: string;
};

export function reviewDraftKey(d: {
  path: string;
  line: number;
  side: ReviewDraftSide;
  startLine?: number;
}): string {
  return `${d.path}|${d.side}|${d.startLine ?? d.line}-${d.line}`;
}
