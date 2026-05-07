import type { StoredSignal } from "#/features/signals/components/InboxView";

export function TaskDetail({ signal }: { signal: StoredSignal }) {
  const identifier = signal.payload?.identifier as string | undefined;
  const stateName = signal.payload?.state_name as string | undefined;
  const priority = signal.payload?.priority_label as string | undefined;
  const teamKey = signal.payload?.team_key as string | undefined;
  return (
    <dl
      data-slot="task-detail"
      className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm"
    >
      {identifier && (
        <>
          <dt className="text-muted-foreground">Ticket</dt>
          <dd className="font-mono text-foreground">{identifier}</dd>
        </>
      )}
      {teamKey && (
        <>
          <dt className="text-muted-foreground">Team</dt>
          <dd className="text-foreground">{teamKey}</dd>
        </>
      )}
      {stateName && (
        <>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="text-foreground">{stateName}</dd>
        </>
      )}
      {priority && (
        <>
          <dt className="text-muted-foreground">Priority</dt>
          <dd className="text-foreground">{priority}</dd>
        </>
      )}
    </dl>
  );
}
