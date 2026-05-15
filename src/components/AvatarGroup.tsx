"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/cn";

// Gravatar accepts SHA-256 hashes of the lowercased, trimmed email since 2024.
// `d=404` makes Gravatar 404 when no profile exists so AvatarImage's natural
// load failure surfaces AvatarFallback.
async function gravatarUrl(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `https://www.gravatar.com/avatar/${hex}?d=404&s=80`;
}

function useGravatarUrls(people: AvatarGroupPerson[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Stable key from the email set so we don't re-run on every render when the
  // parent passes a fresh `people` array reference each time.
  const emailKey = people
    .map((p) => p.email?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .sort()
    .join("|");
  useEffect(() => {
    if (!emailKey) return;
    let cancelled = false;
    const targets = emailKey.split("|");
    Promise.all(
      targets.map(async (email) => [email, await gravatarUrl(email)] as const),
    )
      .then((pairs) => {
        if (cancelled) return;
        setUrls(Object.fromEntries(pairs));
      })
      .catch(() => {
        // crypto.subtle unavailable (older browser / non-https): fall back to
        // initials. No state change needed.
      });
    return () => {
      cancelled = true;
    };
  }, [emailKey]);
  return urls;
}

export type AvatarGroupPerson = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type Props = {
  people: AvatarGroupPerson[];
  max?: number;
  size?: "sm" | "default" | "lg";
  className?: string;
};

function initialsFor(p: AvatarGroupPerson): string {
  const label = (p.name?.trim() || p.email?.split("@")[0] || "?").trim();
  const parts = label.split(/\s+|[._-]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0] ?? "?";
    return (w.slice(0, 2) || "?").toUpperCase();
  }
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function labelFor(p: AvatarGroupPerson): string {
  return p.name?.trim() || p.email || "Unknown";
}

export function AvatarGroup({
  people,
  max = 5,
  size = "sm",
  className,
}: Props) {
  const visible = people.slice(0, max);
  const extra = people.length - visible.length;
  const gravatars = useGravatarUrls(visible);

  return (
    <TooltipProvider delay={150}>
      <div className={cn("flex items-center -space-x-2", className)}>
        {visible.map((person, idx) => {
          const personEmailKey = person.email?.trim().toLowerCase();
          const src =
            person.avatarUrl ??
            (personEmailKey ? gravatars[personEmailKey] : undefined);
          const key = personEmailKey ?? person.name ?? `__idx-${idx}`;
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={(triggerProps) => (
                  <Avatar
                    {...triggerProps}
                    size={size}
                    className="ring-2 ring-background transition-transform hover:-translate-y-0.5 hover:z-10"
                  />
                )}
              >
                {src ? <AvatarImage src={src} alt={labelFor(person)} /> : null}
                <AvatarFallback>{initialsFor(person)}</AvatarFallback>
              </TooltipTrigger>
              <TooltipPopup>{labelFor(person)}</TooltipPopup>
            </Tooltip>
          );
        })}
        {extra > 0 && (
          <Avatar
            size={size}
            className="ring-2 ring-background"
            aria-label={`+${extra} more`}
          >
            <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
              +{extra}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
}
