import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";
import { AutomationsPanel } from "#/features/automations/components/AutomationsPanel";

const automationsSearchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/automations")({
  validateSearch: automationsSearchSchema,
  component: AutomationsRoute,
});

function AutomationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = search.q ?? "";
  const onQChange = useCallback(
    (next: string) => {
      navigate({
        search: (prev) => ({ ...prev, q: next.length > 0 ? next : undefined }),
        replace: true,
      });
    },
    [navigate],
  );
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-8">
      <AutomationsPanel q={q} onQChange={onQChange} />
    </div>
  );
}
